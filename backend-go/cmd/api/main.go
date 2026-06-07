package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

const (
	maxFailedLoginAttempts = 5
	lockDuration           = 5 * time.Minute
)

type config struct {
	port                 string
	databaseURL          string
	allowedOrigins       []string
	tokenSecret          []byte
	tokenValiditySeconds int64
}

type app struct {
	cfg config
	db  *pgxpool.Pool
	log *slog.Logger
}

type authUser struct {
	ID            int64
	Email         string
	PlatformAdmin bool
	SessionID     string
}

type authResponse struct {
	AccessToken   string `json:"accessToken"`
	UserID        int64  `json:"userId"`
	Email         string `json:"email"`
	Nickname      string `json:"nickname"`
	PlatformAdmin bool   `json:"platformAdmin"`
}

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	cfg, err := loadConfig()
	if err != nil {
		logger.Error("configuration failed", "error", err)
		os.Exit(1)
	}

	ctx := context.Background()
	db, err := pgxpool.New(ctx, cfg.databaseURL)
	if err != nil {
		logger.Error("database pool failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		logger.Error("database ping failed", "error", err)
		os.Exit(1)
	}

	api := &app{cfg: cfg, db: db, log: logger}
	if err := api.ensureSchema(ctx); err != nil {
		logger.Error("database schema failed", "error", err)
		os.Exit(1)
	}

	server := &http.Server{
		Addr:              ":" + cfg.port,
		Handler:           api.routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	logger.Info("family platform Go API started", "port", cfg.port)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func loadConfig() (config, error) {
	secret := getenv("APP_SECURITY_TOKEN_SECRET", "")
	if len(secret) < 48 {
		return config{}, fmt.Errorf("APP_SECURITY_TOKEN_SECRET must be at least 48 characters")
	}
	validity, err := strconv.ParseInt(getenv("APP_SECURITY_TOKEN_VALIDITY_SECONDS", "86400"), 10, 64)
	if err != nil || validity <= 0 {
		return config{}, fmt.Errorf("APP_SECURITY_TOKEN_VALIDITY_SECONDS must be positive")
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		user := getenv("POSTGRES_USER", "family_app")
		password := getenv("POSTGRES_PASSWORD", "family_app_password")
		db := getenv("POSTGRES_DB", "family_platform")
		host := getenv("POSTGRES_HOST", "localhost")
		port := getenv("POSTGRES_PORT", "5432")
		databaseURL = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, password, host, port, db)
	}
	return config{
		port:                 getenv("PORT", "8080"),
		databaseURL:          databaseURL,
		allowedOrigins:       splitCSV(getenv("APP_CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")),
		tokenSecret:          []byte(secret),
		tokenValiditySeconds: validity,
	}, nil
}

func (a *app) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", a.health)
	mux.HandleFunc("POST /api/auth/register", a.register)
	mux.HandleFunc("POST /api/auth/login", a.login)
	mux.HandleFunc("POST /api/auth/logout", a.requireAuth(a.logout))
	mux.HandleFunc("GET /api/auth/me", a.requireAuth(a.me))
	mux.HandleFunc("GET /api/families", a.requireAuth(a.listFamilies))
	return a.securityHeaders(a.cors(mux))
}

func (a *app) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "UP", "runtime": "go"})
}

func (a *app) register(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Nickname string `json:"nickname"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	email := normalizeEmail(req.Email)
	nickname := strings.TrimSpace(req.Nickname)
	if email == "" || nickname == "" || len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "email, nickname and password length >= 8 are required")
		return
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password hashing failed")
		return
	}
	sessionID := newSessionID()

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return
	}
	defer tx.Rollback(r.Context())

	var userCount int64
	if err := tx.QueryRow(r.Context(), "select count(*) from app_users").Scan(&userCount); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	var userID int64
	err = tx.QueryRow(r.Context(), `
		insert into app_users (created_at, email, nickname, platform_admin, password_hash, active_session_id, failed_login_attempts)
		values (now(), $1, $2, $3, $4, $5, 0)
		returning id
	`, email, nickname, userCount == 0, string(passwordHash), sessionID).Scan(&userID)
	if err != nil {
		writeError(w, http.StatusConflict, "email is already registered")
		return
	}
	var familyID int64
	if err := tx.QueryRow(r.Context(), "insert into family_groups (created_at, name) values (now(), $1) returning id", nickname+" 가족").Scan(&familyID); err != nil {
		writeError(w, http.StatusInternalServerError, "family creation failed")
		return
	}
	_, err = tx.Exec(r.Context(), `
		insert into family_members (family_id, user_id, role, joined_at, can_read, can_create, can_update, can_delete)
		values ($1, $2, 'FAMILY_ADMIN', now(), true, true, true, true)
	`, familyID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "family membership creation failed")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return
	}
	user := authUser{ID: userID, Email: email, PlatformAdmin: userCount == 0, SessionID: sessionID}
	writeJSON(w, http.StatusCreated, authResponse{
		AccessToken:   a.issueToken(user),
		UserID:        userID,
		Email:         email,
		Nickname:      nickname,
		PlatformAdmin: user.PlatformAdmin,
	})
}

func (a *app) login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email      string `json:"email"`
		Password   string `json:"password"`
		ForceLogin bool   `json:"forceLogin"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	email := normalizeEmail(req.Email)
	var userID int64
	var nickname, passwordHash string
	var platformAdmin bool
	var activeSessionID sql.NullString
	var lockedUntil sql.NullTime
	var failedAttempts int
	err := a.db.QueryRow(r.Context(), `
		select id, nickname, platform_admin, coalesce(password_hash, ''), active_session_id, locked_until, coalesce(failed_login_attempts, 0)
		from app_users where email = $1
	`, email).Scan(&userID, &nickname, &platformAdmin, &passwordHash, &activeSessionID, &lockedUntil, &failedAttempts)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if lockedUntil.Valid && lockedUntil.Time.After(time.Now()) {
		writeError(w, http.StatusLocked, "account is locked")
		return
	}
	if lockedUntil.Valid {
		_, _ = a.db.Exec(r.Context(), "update app_users set locked_until = null, failed_login_attempts = 0 where id = $1", userID)
		failedAttempts = 0
	}
	if passwordHash == "" || bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)) != nil {
		failedAttempts++
		if failedAttempts >= maxFailedLoginAttempts {
			_, _ = a.db.Exec(r.Context(), "update app_users set failed_login_attempts = $1, locked_until = $2 where id = $3", failedAttempts, time.Now().Add(lockDuration), userID)
		} else {
			_, _ = a.db.Exec(r.Context(), "update app_users set failed_login_attempts = $1 where id = $2", failedAttempts, userID)
		}
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if activeSessionID.Valid && activeSessionID.String != "" && !req.ForceLogin {
		writeError(w, http.StatusConflict, "active session exists")
		return
	}
	sessionID := newSessionID()
	_, err = a.db.Exec(r.Context(), `
		update app_users
		set active_session_id = $1, failed_login_attempts = 0, locked_until = null
		where id = $2
	`, sessionID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "login failed")
		return
	}
	user := authUser{ID: userID, Email: email, PlatformAdmin: platformAdmin, SessionID: sessionID}
	writeJSON(w, http.StatusOK, authResponse{
		AccessToken:   a.issueToken(user),
		UserID:        userID,
		Email:         email,
		Nickname:      nickname,
		PlatformAdmin: platformAdmin,
	})
}

func (a *app) logout(w http.ResponseWriter, r *http.Request, user authUser) {
	_, _ = a.db.Exec(r.Context(), "update app_users set active_session_id = null where id = $1 and active_session_id = $2", user.ID, user.SessionID)
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) me(w http.ResponseWriter, r *http.Request, user authUser) {
	var nickname string
	err := a.db.QueryRow(r.Context(), "select nickname from app_users where id = $1", user.ID).Scan(&nickname)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid session")
		return
	}
	writeJSON(w, http.StatusOK, authResponse{
		AccessToken:   a.issueToken(user),
		UserID:        user.ID,
		Email:         user.Email,
		Nickname:      nickname,
		PlatformAdmin: user.PlatformAdmin,
	})
}

func (a *app) listFamilies(w http.ResponseWriter, r *http.Request, user authUser) {
	query := `
		select f.id, f.created_at, f.name
		from family_groups f
		where $1 = true or exists (
			select 1 from family_members m
			where m.family_id = f.id and m.user_id = $2 and m.can_read = true
		)
		order by f.created_at asc
	`
	rows, err := a.db.Query(r.Context(), query, user.PlatformAdmin, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	type family struct {
		ID        int64     `json:"id"`
		CreatedAt time.Time `json:"createdAt"`
		Name      string    `json:"name"`
	}
	families := []family{}
	for rows.Next() {
		var item family
		if err := rows.Scan(&item.ID, &item.CreatedAt, &item.Name); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return
		}
		families = append(families, item)
	}
	writeJSON(w, http.StatusOK, families)
}

func (a *app) requireAuth(next func(http.ResponseWriter, *http.Request, authUser)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		user, ok := a.verifyToken(strings.TrimPrefix(header, "Bearer "))
		if !ok || !a.isActiveSession(r.Context(), user) {
			writeError(w, http.StatusUnauthorized, "invalid session")
			return
		}
		next(w, r, user)
	}
}

func (a *app) isActiveSession(ctx context.Context, user authUser) bool {
	var activeSessionID sql.NullString
	err := a.db.QueryRow(ctx, "select active_session_id from app_users where id = $1", user.ID).Scan(&activeSessionID)
	return err == nil && activeSessionID.Valid && activeSessionID.String == user.SessionID
}

func (a *app) issueToken(user authUser) string {
	expiresAt := time.Now().Add(time.Duration(a.cfg.tokenValiditySeconds) * time.Second).Unix()
	payload := fmt.Sprintf("%d\n%s\n%t\n%d\n%s", user.ID, user.Email, user.PlatformAdmin, expiresAt, user.SessionID)
	encodedPayload := base64.RawURLEncoding.EncodeToString([]byte(payload))
	return encodedPayload + "." + a.sign(encodedPayload)
}

func (a *app) verifyToken(token string) (authUser, bool) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 || !constantTimeEqual(a.sign(parts[0]), parts[1]) {
		return authUser{}, false
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return authUser{}, false
	}
	values := strings.SplitN(string(payloadBytes), "\n", 5)
	if len(values) != 5 {
		return authUser{}, false
	}
	userID, err := strconv.ParseInt(values[0], 10, 64)
	if err != nil {
		return authUser{}, false
	}
	expiresAt, err := strconv.ParseInt(values[3], 10, 64)
	if err != nil || expiresAt < time.Now().Unix() {
		return authUser{}, false
	}
	return authUser{
		ID:            userID,
		Email:         values[1],
		PlatformAdmin: values[2] == "true",
		SessionID:     values[4],
	}, true
}

func (a *app) sign(encodedPayload string) string {
	mac := hmac.New(sha256.New, a.cfg.tokenSecret)
	mac.Write([]byte(encodedPayload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (a *app) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if originAllowed(origin, a.cfg.allowedOrigins) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *app) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}

func (a *app) ensureSchema(ctx context.Context) error {
	_, err := a.db.Exec(ctx, `
create table if not exists app_users (
  id bigint generated by default as identity primary key,
  created_at timestamp with time zone,
  email varchar(255) unique,
  nickname varchar(255),
  platform_admin boolean not null default false,
  provider varchar(255),
  provider_user_id varchar(255),
  password_hash varchar(255),
  active_session_id varchar(255),
  locked_until timestamp with time zone,
  failed_login_attempts integer default 0
);
create table if not exists family_groups (
  id bigint generated by default as identity primary key,
  created_at timestamp with time zone,
  name varchar(255)
);
create table if not exists family_members (
  id bigint generated by default as identity primary key,
  can_create boolean not null default false,
  can_delete boolean not null default false,
  can_read boolean not null default true,
  can_update boolean not null default false,
  family_id bigint,
  joined_at timestamp with time zone,
  role varchar(255),
  user_id bigint
);
create index if not exists idx_family_members_user on family_members (user_id);
create index if not exists idx_family_members_family on family_members (family_id);
`)
	return err
}

func readJSON(w http.ResponseWriter, r *http.Request, out any) bool {
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(out); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"message": message})
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func newSessionID() string {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(bytes)
}

func getenv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func originAllowed(origin string, allowed []string) bool {
	if origin == "" {
		return false
	}
	for _, item := range allowed {
		if item == "*" || item == origin {
			return true
		}
	}
	return false
}

func constantTimeEqual(expected, actual string) bool {
	if expected == "" || actual == "" {
		return false
	}
	return hmac.Equal([]byte(expected), []byte(actual))
}
