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

	"github.com/jackc/pgx/v5"
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
	mux.HandleFunc("GET /api/families/{familyId}/members", a.requireAuth(a.listFamilyMembers))
	mux.HandleFunc("POST /api/families/{familyId}/members", a.requireAuth(a.addFamilyMember))
	mux.HandleFunc("PUT /api/families/{familyId}/members/{memberId}", a.requireAuth(a.updateFamilyMember))
	mux.HandleFunc("DELETE /api/families/{familyId}/members/{memberId}", a.requireAuth(a.deleteFamilyMember))
	mux.HandleFunc("GET /api/ledger-entries", a.requireAuth(a.listLedgerEntries))
	mux.HandleFunc("GET /api/ledger-entries/summary", a.requireAuth(a.ledgerSummary))
	mux.HandleFunc("POST /api/ledger-entries", a.requireAuth(a.createLedgerEntry))
	mux.HandleFunc("PUT /api/ledger-entries/{entryId}", a.requireAuth(a.updateLedgerEntry))
	mux.HandleFunc("DELETE /api/ledger-entries/{entryId}", a.requireAuth(a.deleteLedgerEntry))
	mux.HandleFunc("GET /api/schedules", a.requireAuth(a.listSchedules))
	mux.HandleFunc("POST /api/schedules", a.requireAuth(a.createSchedule))
	mux.HandleFunc("PUT /api/schedules/{scheduleId}", a.requireAuth(a.updateSchedule))
	mux.HandleFunc("DELETE /api/schedules/{scheduleId}", a.requireAuth(a.deleteSchedule))
	mux.HandleFunc("GET /api/common-code-groups", a.requireAuth(a.listCommonCodeGroups))
	mux.HandleFunc("POST /api/common-code-groups", a.requireAuth(a.createCommonCodeGroup))
	mux.HandleFunc("PUT /api/common-code-groups/{groupId}", a.requireAuth(a.updateCommonCodeGroup))
	mux.HandleFunc("DELETE /api/common-code-groups/{groupId}", a.requireAuth(a.deleteCommonCodeGroup))
	mux.HandleFunc("GET /api/common-code-groups/{groupId}/codes", a.requireAuth(a.listCommonCodes))
	mux.HandleFunc("POST /api/common-code-groups/{groupId}/codes", a.requireAuth(a.createCommonCode))
	mux.HandleFunc("PUT /api/common-code-groups/{groupId}/codes/{codeId}", a.requireAuth(a.updateCommonCode))
	mux.HandleFunc("DELETE /api/common-code-groups/{groupId}/codes/{codeId}", a.requireAuth(a.deleteCommonCode))
	mux.HandleFunc("GET /api/trips", a.requireAuth(a.listTrips))
	mux.HandleFunc("POST /api/trips", a.requireAuth(a.createTrip))
	mux.HandleFunc("PUT /api/trips/{tripId}", a.requireAuth(a.updateTrip))
	mux.HandleFunc("DELETE /api/trips/{tripId}", a.requireAuth(a.deleteTrip))
	mux.HandleFunc("GET /api/trips/{tripId}/records", a.requireAuth(a.listTravelRecords))
	mux.HandleFunc("POST /api/trips/{tripId}/records", a.requireAuth(a.createTravelRecord))
	mux.HandleFunc("PUT /api/travel-records/{recordId}", a.requireAuth(a.updateTravelRecord))
	mux.HandleFunc("DELETE /api/travel-records/{recordId}", a.requireAuth(a.deleteTravelRecord))
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

type familyMember struct {
	ID        int64  `json:"id"`
	FamilyID  int64  `json:"familyId"`
	UserID    int64  `json:"userId"`
	Role      string `json:"role"`
	CanRead   bool   `json:"canRead"`
	CanCreate bool   `json:"canCreate"`
	CanUpdate bool   `json:"canUpdate"`
	CanDelete bool   `json:"canDelete"`
	JoinedAt  string `json:"joinedAt"`
}

func (a *app) listFamilyMembers(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := pathID(w, r, "familyId")
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select id, family_id, user_id, role, can_read, can_create, can_update, can_delete, joined_at
		from family_members where family_id = $1 order by joined_at asc
	`, familyID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items := []familyMember{}
	for rows.Next() {
		var item familyMember
		var joinedAt time.Time
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.UserID, &item.Role, &item.CanRead, &item.CanCreate, &item.CanUpdate, &item.CanDelete, &joinedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return
		}
		item.JoinedAt = formatTime(joinedAt)
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) addFamilyMember(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := pathID(w, r, "familyId")
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "update") {
		return
	}
	var req struct {
		UserID    int64  `json:"userId"`
		Role      string `json:"role"`
		CanRead   bool   `json:"canRead"`
		CanCreate bool   `json:"canCreate"`
		CanUpdate bool   `json:"canUpdate"`
		CanDelete bool   `json:"canDelete"`
	}
	if !readJSON(w, r, &req) || req.UserID <= 0 {
		return
	}
	var item familyMember
	var joinedAt time.Time
	err := a.db.QueryRow(r.Context(), `
		insert into family_members (family_id, user_id, role, joined_at, can_read, can_create, can_update, can_delete)
		values ($1, $2, $3, now(), $4, $5, $6, $7)
		returning id, family_id, user_id, role, can_read, can_create, can_update, can_delete, joined_at
	`, familyID, req.UserID, emptyDefault(req.Role, "MEMBER"), req.CanRead, req.CanCreate, req.CanUpdate, req.CanDelete).
		Scan(&item.ID, &item.FamilyID, &item.UserID, &item.Role, &item.CanRead, &item.CanCreate, &item.CanUpdate, &item.CanDelete, &joinedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "family member creation failed")
		return
	}
	item.JoinedAt = formatTime(joinedAt)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateFamilyMember(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := pathID(w, r, "familyId")
	memberID, ok2 := pathID(w, r, "memberId")
	if !ok || !ok2 || !a.requireFamilyPermission(w, r.Context(), user, familyID, "update") {
		return
	}
	var req struct {
		UserID    int64  `json:"userId"`
		Role      string `json:"role"`
		CanRead   bool   `json:"canRead"`
		CanCreate bool   `json:"canCreate"`
		CanUpdate bool   `json:"canUpdate"`
		CanDelete bool   `json:"canDelete"`
	}
	if !readJSON(w, r, &req) || req.UserID <= 0 {
		return
	}
	var item familyMember
	var joinedAt time.Time
	err := a.db.QueryRow(r.Context(), `
		update family_members set user_id = $1, role = $2, can_read = $3, can_create = $4, can_update = $5, can_delete = $6
		where id = $7 and family_id = $8
		returning id, family_id, user_id, role, can_read, can_create, can_update, can_delete, joined_at
	`, req.UserID, emptyDefault(req.Role, "MEMBER"), req.CanRead, req.CanCreate, req.CanUpdate, req.CanDelete, memberID, familyID).
		Scan(&item.ID, &item.FamilyID, &item.UserID, &item.Role, &item.CanRead, &item.CanCreate, &item.CanUpdate, &item.CanDelete, &joinedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "family member not found")
		return
	}
	item.JoinedAt = formatTime(joinedAt)
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteFamilyMember(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := pathID(w, r, "familyId")
	memberID, ok2 := pathID(w, r, "memberId")
	if !ok || !ok2 || !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	tag, err := a.db.Exec(r.Context(), "delete from family_members where id = $1 and family_id = $2", memberID, familyID)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "family member not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type ledgerEntry struct {
	ID              int64   `json:"id"`
	FamilyID        int64   `json:"familyId"`
	Title           string  `json:"title"`
	EntryType       string  `json:"entryType"`
	Category        *string `json:"category,omitempty"`
	PaymentMethod   *string `json:"paymentMethod,omitempty"`
	MemberName      *string `json:"memberName,omitempty"`
	Amount          float64 `json:"amount"`
	TransactionDate string  `json:"transactionDate"`
	Memo            *string `json:"memo,omitempty"`
	CreatedAt       string  `json:"createdAt"`
}

func (a *app) listLedgerEntries(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, start, end, ok := familyDateRange(w, r)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select id, family_id, title, entry_type, category, payment_method, member_name, coalesce(amount, 0),
		       transaction_date, memo, created_at
		from ledger_entries
		where family_id = $1 and transaction_date between $2 and $3
		order by transaction_date desc, created_at desc
	`, familyID, start, end)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items, ok := scanLedgerEntries(w, rows)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) ledgerSummary(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, start, end, ok := familyDateRange(w, r)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	var expense, income float64
	err := a.db.QueryRow(r.Context(), `
		select
		  coalesce(sum(case when entry_type = 'expense' then amount else 0 end), 0),
		  coalesce(sum(case when entry_type = 'income' then amount else 0 end), 0)
		from ledger_entries
		where family_id = $1 and transaction_date between $2 and $3
	`, familyID, start, end).Scan(&expense, &income)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]float64{"expense": expense, "income": income, "total": income - expense})
}

func (a *app) createLedgerEntry(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID := queryInt64(r, "familyId", 1)
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	req, ok := readLedgerPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveLedgerEntry(w, r, 0, familyID, req)
	if !ok {
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateLedgerEntry(w http.ResponseWriter, r *http.Request, user authUser) {
	entryID, ok := pathID(w, r, "entryId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from ledger_entries where id = $1", entryID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "update") {
		return
	}
	req, ok := readLedgerPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveLedgerEntry(w, r, entryID, familyID, req)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteLedgerEntry(w http.ResponseWriter, r *http.Request, user authUser) {
	entryID, ok := pathID(w, r, "entryId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from ledger_entries where id = $1", entryID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "delete from ledger_entries where id = $1", entryID)
	w.WriteHeader(http.StatusNoContent)
}

type scheduleItem struct {
	ID            int64   `json:"id"`
	FamilyID      int64   `json:"familyId"`
	Title         string  `json:"title"`
	CalendarBasis string  `json:"calendarBasis"`
	ScheduleDate  string  `json:"scheduleDate"`
	ScheduleTime  *string `json:"scheduleTime,omitempty"`
	Category      *string `json:"category,omitempty"`
	MemberName    *string `json:"memberName,omitempty"`
	RepeatRule    *string `json:"repeatRule,omitempty"`
	Memo          *string `json:"memo,omitempty"`
	CreatedAt     string  `json:"createdAt"`
}

func (a *app) listSchedules(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, start, end, ok := familyDateRange(w, r)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select id, family_id, title, calendar_basis, schedule_date, schedule_time::text, category, member_name, repeat_rule, memo, created_at
		from family_schedules
		where family_id = $1 and schedule_date between $2 and $3
		order by schedule_date asc, schedule_time asc nulls last, created_at desc
	`, familyID, start, end)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items, ok := scanSchedules(w, rows)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) createSchedule(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID := queryInt64(r, "familyId", 1)
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	req, ok := readSchedulePayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveSchedule(w, r, 0, familyID, req)
	if !ok {
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateSchedule(w http.ResponseWriter, r *http.Request, user authUser) {
	id, ok := pathID(w, r, "scheduleId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from family_schedules where id = $1", id)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "update") {
		return
	}
	req, ok := readSchedulePayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveSchedule(w, r, id, familyID, req)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteSchedule(w http.ResponseWriter, r *http.Request, user authUser) {
	id, ok := pathID(w, r, "scheduleId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from family_schedules where id = $1", id)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "delete from family_schedules where id = $1", id)
	w.WriteHeader(http.StatusNoContent)
}

type commonCodeGroup struct {
	ID        int64  `json:"id"`
	FamilyID  int64  `json:"familyId"`
	MenuKey   string `json:"menuKey"`
	Code      string `json:"code"`
	Name      string `json:"name"`
	Active    bool   `json:"active"`
	CreatedAt string `json:"createdAt"`
}

type commonCode struct {
	ID        int64  `json:"id"`
	GroupID   int64  `json:"groupId"`
	Code      string `json:"code"`
	Name      string `json:"name"`
	SortOrder int    `json:"sortOrder"`
	Active    bool   `json:"active"`
	CreatedAt string `json:"createdAt"`
}

func (a *app) listCommonCodeGroups(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID := queryInt64(r, "familyId", 1)
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	menuKey := strings.TrimSpace(r.URL.Query().Get("menuKey"))
	rows, err := a.db.Query(r.Context(), `
		select id, family_id, menu_key, code, name, active, created_at
		from common_code_groups
		where family_id = $1 and ($2 = '' or menu_key = $2)
		order by menu_key asc, code asc, created_at asc
	`, familyID, menuKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items := []commonCodeGroup{}
	for rows.Next() {
		var item commonCodeGroup
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.MenuKey, &item.Code, &item.Name, &item.Active, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return
		}
		item.CreatedAt = formatTime(createdAt)
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) createCommonCodeGroup(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID := queryInt64(r, "familyId", 1)
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "update") {
		return
	}
	req, ok := readCommonCodeGroupPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveCommonCodeGroup(w, r, 0, familyID, req)
	if !ok {
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateCommonCodeGroup(w http.ResponseWriter, r *http.Request, user authUser) {
	id, ok := pathID(w, r, "groupId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from common_code_groups where id = $1", id)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "update") {
		return
	}
	req, ok := readCommonCodeGroupPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveCommonCodeGroup(w, r, id, familyID, req)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteCommonCodeGroup(w http.ResponseWriter, r *http.Request, user authUser) {
	id, ok := pathID(w, r, "groupId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from common_code_groups where id = $1", id)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "delete from common_codes where group_id = $1", id)
	_, _ = a.db.Exec(r.Context(), "delete from common_code_groups where id = $1", id)
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) listCommonCodes(w http.ResponseWriter, r *http.Request, user authUser) {
	groupID, ok := pathID(w, r, "groupId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from common_code_groups where id = $1", groupID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select id, group_id, code, name, coalesce(sort_order, 0), active, created_at
		from common_codes where group_id = $1 order by sort_order asc, id asc
	`, groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items := []commonCode{}
	for rows.Next() {
		var item commonCode
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.GroupID, &item.Code, &item.Name, &item.SortOrder, &item.Active, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return
		}
		item.CreatedAt = formatTime(createdAt)
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) createCommonCode(w http.ResponseWriter, r *http.Request, user authUser) {
	groupID, ok := pathID(w, r, "groupId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from common_code_groups where id = $1", groupID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "update") {
		return
	}
	req, ok := readCommonCodePayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveCommonCode(w, r, 0, groupID, req)
	if !ok {
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateCommonCode(w http.ResponseWriter, r *http.Request, user authUser) {
	groupID, ok := pathID(w, r, "groupId")
	codeID, ok2 := pathID(w, r, "codeId")
	if !ok || !ok2 {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from common_code_groups where id = $1", groupID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "update") {
		return
	}
	req, ok := readCommonCodePayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveCommonCode(w, r, codeID, groupID, req)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteCommonCode(w http.ResponseWriter, r *http.Request, user authUser) {
	groupID, ok := pathID(w, r, "groupId")
	codeID, ok2 := pathID(w, r, "codeId")
	if !ok || !ok2 {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from common_code_groups where id = $1", groupID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "delete from common_codes where id = $1 and group_id = $2", codeID, groupID)
	w.WriteHeader(http.StatusNoContent)
}

type tripItem struct {
	ID          int64   `json:"id"`
	FamilyID    int64   `json:"familyId"`
	Title       string  `json:"title"`
	StartDate   string  `json:"startDate"`
	EndDate     string  `json:"endDate"`
	Description *string `json:"description,omitempty"`
	CreatedAt   string  `json:"createdAt"`
}

type travelRecordItem struct {
	ID         int64    `json:"id"`
	TripID     int64    `json:"tripId"`
	SortOrder  *int     `json:"sortOrder,omitempty"`
	Title      string   `json:"title"`
	Category   *string  `json:"category,omitempty"`
	Amount     float64  `json:"amount"`
	Note       *string  `json:"note,omitempty"`
	Location   string   `json:"location"`
	Latitude   float64  `json:"latitude"`
	Longitude  float64  `json:"longitude"`
	RecordDate string   `json:"recordDate"`
	RecordTime *string  `json:"recordTime,omitempty"`
	MediaURLs  []string `json:"mediaUrls"`
	CreatedAt  string   `json:"createdAt"`
}

func (a *app) listTrips(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID := queryInt64(r, "familyId", 1)
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select id, family_id, title, start_date, end_date, description, created_at
		from trips where family_id = $1 order by created_at desc
	`, familyID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items, ok := scanTrips(w, rows)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) createTrip(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID := queryInt64(r, "familyId", 1)
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	req, ok := readTripPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveTrip(w, r, 0, familyID, req)
	if !ok {
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateTrip(w http.ResponseWriter, r *http.Request, user authUser) {
	tripID, ok := pathID(w, r, "tripId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from trips where id = $1", tripID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "update") {
		return
	}
	req, ok := readTripPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveTrip(w, r, tripID, familyID, req)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteTrip(w http.ResponseWriter, r *http.Request, user authUser) {
	tripID, ok := pathID(w, r, "tripId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from trips where id = $1", tripID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "delete from travel_record_media_urls where travel_record_id in (select id from travel_records where trip_id = $1)", tripID)
	_, _ = a.db.Exec(r.Context(), "delete from travel_records where trip_id = $1", tripID)
	_, _ = a.db.Exec(r.Context(), "delete from trips where id = $1", tripID)
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) listTravelRecords(w http.ResponseWriter, r *http.Request, user authUser) {
	tripID, ok := pathID(w, r, "tripId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from trips where id = $1", tripID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	items, ok := a.travelRecordsByTrip(w, r.Context(), tripID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) createTravelRecord(w http.ResponseWriter, r *http.Request, user authUser) {
	tripID, ok := pathID(w, r, "tripId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from trips where id = $1", tripID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	req, ok := readTravelRecordPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveTravelRecord(w, r, 0, tripID, req)
	if !ok {
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateTravelRecord(w http.ResponseWriter, r *http.Request, user authUser) {
	recordID, ok := pathID(w, r, "recordId")
	if !ok {
		return
	}
	var tripID, familyID int64
	err := a.db.QueryRow(r.Context(), `
		select r.trip_id, t.family_id from travel_records r join trips t on t.id = r.trip_id where r.id = $1
	`, recordID).Scan(&tripID, &familyID)
	if err != nil {
		writeError(w, http.StatusNotFound, "travel record not found")
		return
	}
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "update") {
		return
	}
	req, ok := readTravelRecordPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveTravelRecord(w, r, recordID, tripID, req)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteTravelRecord(w http.ResponseWriter, r *http.Request, user authUser) {
	recordID, ok := pathID(w, r, "recordId")
	if !ok {
		return
	}
	var tripID, familyID int64
	err := a.db.QueryRow(r.Context(), `
		select r.trip_id, t.family_id from travel_records r join trips t on t.id = r.trip_id where r.id = $1
	`, recordID).Scan(&tripID, &familyID)
	if err != nil {
		writeError(w, http.StatusNotFound, "travel record not found")
		return
	}
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "delete from travel_record_media_urls where travel_record_id = $1", recordID)
	_, _ = a.db.Exec(r.Context(), "delete from travel_records where id = $1", recordID)
	_ = tripID
	w.WriteHeader(http.StatusNoContent)
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
create table if not exists family_schedules (
  id bigint generated by default as identity primary key,
  calendar_basis varchar(255),
  category varchar(255),
  created_at timestamp with time zone,
  family_id bigint,
  member_name varchar(255),
  memo varchar(255),
  repeat_rule varchar(255),
  schedule_date date,
  schedule_time time without time zone,
  title varchar(255)
);
create table if not exists ledger_entries (
  id bigint generated by default as identity primary key,
  amount numeric(38,2),
  category varchar(255),
  created_at timestamp with time zone,
  entry_type varchar(255),
  family_id bigint,
  member_name varchar(255),
  memo varchar(255),
  payment_method varchar(255),
  title varchar(255),
  transaction_date date
);
create table if not exists trips (
  id bigint generated by default as identity primary key,
  created_at timestamp with time zone,
  description varchar(255),
  end_date date,
  family_id bigint,
  start_date date,
  title varchar(255)
);
create table if not exists travel_records (
  id bigint generated by default as identity primary key,
  amount numeric(38,2),
  category varchar(255),
  created_at timestamp with time zone,
  latitude double precision,
  location varchar(255),
  longitude double precision,
  note varchar(255),
  record_date date,
  record_time time without time zone,
  sort_order integer,
  title varchar(255),
  trip_id bigint
);
create table if not exists travel_record_media_urls (
  travel_record_id bigint not null,
  media_urls varchar(2048)
);
create table if not exists common_code_groups (
  id bigint generated by default as identity primary key,
  active boolean not null,
  code varchar(255),
  created_at timestamp with time zone,
  family_id bigint,
  menu_key varchar(255),
  name varchar(255)
);
create table if not exists common_codes (
  id bigint generated by default as identity primary key,
  active boolean not null,
  code varchar(255),
  created_at timestamp with time zone,
  group_id bigint,
  name varchar(255),
  sort_order integer
);
create index if not exists idx_family_schedules_family_date on family_schedules (family_id, schedule_date);
create index if not exists idx_ledger_entries_family_date on ledger_entries (family_id, transaction_date);
create index if not exists idx_trips_family on trips (family_id);
create index if not exists idx_travel_records_trip_order on travel_records (trip_id, sort_order);
create index if not exists idx_common_code_groups_family_menu on common_code_groups (family_id, menu_key);
create index if not exists idx_common_codes_group_order on common_codes (group_id, sort_order);
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

func pathID(w http.ResponseWriter, r *http.Request, name string) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, name+" is invalid")
		return 0, false
	}
	return id, true
}

func queryInt64(r *http.Request, name string, fallback int64) int64 {
	raw := strings.TrimSpace(r.URL.Query().Get(name))
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func familyDateRange(w http.ResponseWriter, r *http.Request) (int64, string, string, bool) {
	familyID := queryInt64(r, "familyId", 1)
	start := strings.TrimSpace(r.URL.Query().Get("startDate"))
	end := strings.TrimSpace(r.URL.Query().Get("endDate"))
	if !validDate(start) || !validDate(end) {
		writeError(w, http.StatusBadRequest, "startDate and endDate are required")
		return 0, "", "", false
	}
	return familyID, start, end, true
}

func validDate(value string) bool {
	_, err := time.Parse("2006-01-02", value)
	return err == nil
}

func validTimeText(value string) bool {
	if value == "" {
		return true
	}
	_, err := time.Parse("15:04", value)
	return err == nil
}

func formatDate(value time.Time) string {
	return value.Format("2006-01-02")
}

func formatTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339)
}

func nullString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func ptrString(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}

func emptyDefault(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func (a *app) requireFamilyPermission(w http.ResponseWriter, ctx context.Context, user authUser, familyID int64, permission string) bool {
	if user.PlatformAdmin {
		return true
	}
	column := map[string]string{
		"read":   "can_read",
		"create": "can_create",
		"update": "can_update",
		"delete": "can_delete",
	}[permission]
	if column == "" {
		writeError(w, http.StatusForbidden, "permission denied")
		return false
	}
	var allowed bool
	query := fmt.Sprintf("select exists(select 1 from family_members where family_id = $1 and user_id = $2 and %s = true)", column)
	if err := a.db.QueryRow(ctx, query, familyID, user.ID).Scan(&allowed); err != nil || !allowed {
		writeError(w, http.StatusForbidden, "permission denied")
		return false
	}
	return true
}

func (a *app) resourceFamilyID(w http.ResponseWriter, ctx context.Context, query string, id int64) (int64, bool) {
	var familyID int64
	if err := a.db.QueryRow(ctx, query, id).Scan(&familyID); err != nil {
		writeError(w, http.StatusNotFound, "resource not found")
		return 0, false
	}
	return familyID, true
}

type ledgerPayload struct {
	Title           string  `json:"title"`
	EntryType       string  `json:"entryType"`
	Category        *string `json:"category"`
	PaymentMethod   *string `json:"paymentMethod"`
	MemberName      *string `json:"memberName"`
	Amount          float64 `json:"amount"`
	TransactionDate string  `json:"transactionDate"`
	Memo            *string `json:"memo"`
}

func readLedgerPayload(w http.ResponseWriter, r *http.Request) (ledgerPayload, bool) {
	var req ledgerPayload
	if !readJSON(w, r, &req) {
		return req, false
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" || req.EntryType == "" || !validDate(req.TransactionDate) {
		writeError(w, http.StatusBadRequest, "title, entryType and transactionDate are required")
		return req, false
	}
	return req, true
}

func (a *app) saveLedgerEntry(w http.ResponseWriter, r *http.Request, entryID int64, familyID int64, req ledgerPayload) (ledgerEntry, bool) {
	var item ledgerEntry
	var category, payment, member, memo sql.NullString
	var transactionDate, createdAt time.Time
	var err error
	if entryID == 0 {
		err = a.db.QueryRow(r.Context(), `
			insert into ledger_entries (family_id, title, entry_type, category, payment_method, member_name, amount, transaction_date, memo, created_at)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
			returning id, family_id, title, entry_type, category, payment_method, member_name, coalesce(amount, 0), transaction_date, memo, created_at
		`, familyID, req.Title, req.EntryType, req.Category, req.PaymentMethod, req.MemberName, req.Amount, req.TransactionDate, req.Memo).
			Scan(&item.ID, &item.FamilyID, &item.Title, &item.EntryType, &category, &payment, &member, &item.Amount, &transactionDate, &memo, &createdAt)
	} else {
		err = a.db.QueryRow(r.Context(), `
			update ledger_entries set title = $1, entry_type = $2, category = $3, payment_method = $4, member_name = $5, amount = $6, transaction_date = $7, memo = $8
			where id = $9 and family_id = $10
			returning id, family_id, title, entry_type, category, payment_method, member_name, coalesce(amount, 0), transaction_date, memo, created_at
		`, req.Title, req.EntryType, req.Category, req.PaymentMethod, req.MemberName, req.Amount, req.TransactionDate, req.Memo, entryID, familyID).
			Scan(&item.ID, &item.FamilyID, &item.Title, &item.EntryType, &category, &payment, &member, &item.Amount, &transactionDate, &memo, &createdAt)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "ledger save failed")
		return item, false
	}
	item.Category = nullString(category)
	item.PaymentMethod = nullString(payment)
	item.MemberName = nullString(member)
	item.Memo = nullString(memo)
	item.TransactionDate = formatDate(transactionDate)
	item.CreatedAt = formatTime(createdAt)
	return item, true
}

func scanLedgerEntries(w http.ResponseWriter, rows pgx.Rows) ([]ledgerEntry, bool) {
	items := []ledgerEntry{}
	for rows.Next() {
		var item ledgerEntry
		var category, payment, member, memo sql.NullString
		var transactionDate, createdAt time.Time
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.Title, &item.EntryType, &category, &payment, &member, &item.Amount, &transactionDate, &memo, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.Category = nullString(category)
		item.PaymentMethod = nullString(payment)
		item.MemberName = nullString(member)
		item.Memo = nullString(memo)
		item.TransactionDate = formatDate(transactionDate)
		item.CreatedAt = formatTime(createdAt)
		items = append(items, item)
	}
	return items, true
}

type schedulePayload struct {
	Title         string  `json:"title"`
	CalendarBasis string  `json:"calendarBasis"`
	ScheduleDate  string  `json:"scheduleDate"`
	ScheduleTime  *string `json:"scheduleTime"`
	Category      *string `json:"category"`
	MemberName    *string `json:"memberName"`
	RepeatRule    *string `json:"repeatRule"`
	Memo          *string `json:"memo"`
}

func readSchedulePayload(w http.ResponseWriter, r *http.Request) (schedulePayload, bool) {
	var req schedulePayload
	if !readJSON(w, r, &req) {
		return req, false
	}
	req.Title = strings.TrimSpace(req.Title)
	req.CalendarBasis = emptyDefault(req.CalendarBasis, "solar")
	if req.Title == "" || !validDate(req.ScheduleDate) {
		writeError(w, http.StatusBadRequest, "title and scheduleDate are required")
		return req, false
	}
	if req.ScheduleTime != nil && !validTimeText(strings.TrimSpace(*req.ScheduleTime)) {
		writeError(w, http.StatusBadRequest, "scheduleTime is invalid")
		return req, false
	}
	return req, true
}

func (a *app) saveSchedule(w http.ResponseWriter, r *http.Request, id int64, familyID int64, req schedulePayload) (scheduleItem, bool) {
	var item scheduleItem
	var scheduleDate, createdAt time.Time
	var scheduleTime, category, member, repeat, memo sql.NullString
	var err error
	if id == 0 {
		err = a.db.QueryRow(r.Context(), `
			insert into family_schedules (family_id, title, calendar_basis, schedule_date, schedule_time, category, member_name, repeat_rule, memo, created_at)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
			returning id, family_id, title, calendar_basis, schedule_date, schedule_time::text, category, member_name, repeat_rule, memo, created_at
		`, familyID, req.Title, req.CalendarBasis, req.ScheduleDate, req.ScheduleTime, req.Category, req.MemberName, req.RepeatRule, req.Memo).
			Scan(&item.ID, &item.FamilyID, &item.Title, &item.CalendarBasis, &scheduleDate, &scheduleTime, &category, &member, &repeat, &memo, &createdAt)
	} else {
		err = a.db.QueryRow(r.Context(), `
			update family_schedules set title=$1, calendar_basis=$2, schedule_date=$3, schedule_time=$4, category=$5, member_name=$6, repeat_rule=$7, memo=$8
			where id=$9 and family_id=$10
			returning id, family_id, title, calendar_basis, schedule_date, schedule_time::text, category, member_name, repeat_rule, memo, created_at
		`, req.Title, req.CalendarBasis, req.ScheduleDate, req.ScheduleTime, req.Category, req.MemberName, req.RepeatRule, req.Memo, id, familyID).
			Scan(&item.ID, &item.FamilyID, &item.Title, &item.CalendarBasis, &scheduleDate, &scheduleTime, &category, &member, &repeat, &memo, &createdAt)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "schedule save failed")
		return item, false
	}
	item.ScheduleDate = formatDate(scheduleDate)
	item.ScheduleTime = nullString(scheduleTime)
	item.Category = nullString(category)
	item.MemberName = nullString(member)
	item.RepeatRule = nullString(repeat)
	item.Memo = nullString(memo)
	item.CreatedAt = formatTime(createdAt)
	return item, true
}

func scanSchedules(w http.ResponseWriter, rows pgx.Rows) ([]scheduleItem, bool) {
	items := []scheduleItem{}
	for rows.Next() {
		var item scheduleItem
		var scheduleDate, createdAt time.Time
		var scheduleTime, category, member, repeat, memo sql.NullString
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.Title, &item.CalendarBasis, &scheduleDate, &scheduleTime, &category, &member, &repeat, &memo, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.ScheduleDate = formatDate(scheduleDate)
		item.ScheduleTime = nullString(scheduleTime)
		item.Category = nullString(category)
		item.MemberName = nullString(member)
		item.RepeatRule = nullString(repeat)
		item.Memo = nullString(memo)
		item.CreatedAt = formatTime(createdAt)
		items = append(items, item)
	}
	return items, true
}

type commonCodeGroupPayload struct {
	MenuKey string `json:"menuKey"`
	Code    string `json:"code"`
	Name    string `json:"name"`
	Active  bool   `json:"active"`
}

type commonCodePayload struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	SortOrder int    `json:"sortOrder"`
	Active    bool   `json:"active"`
}

func readCommonCodeGroupPayload(w http.ResponseWriter, r *http.Request) (commonCodeGroupPayload, bool) {
	var req commonCodeGroupPayload
	if !readJSON(w, r, &req) {
		return req, false
	}
	req.MenuKey = strings.TrimSpace(req.MenuKey)
	req.Code = strings.TrimSpace(req.Code)
	req.Name = strings.TrimSpace(req.Name)
	if req.MenuKey == "" || req.Code == "" || req.Name == "" {
		writeError(w, http.StatusBadRequest, "menuKey, code and name are required")
		return req, false
	}
	return req, true
}

func readCommonCodePayload(w http.ResponseWriter, r *http.Request) (commonCodePayload, bool) {
	var req commonCodePayload
	if !readJSON(w, r, &req) {
		return req, false
	}
	req.Code = strings.TrimSpace(req.Code)
	req.Name = strings.TrimSpace(req.Name)
	if req.Code == "" || req.Name == "" {
		writeError(w, http.StatusBadRequest, "code and name are required")
		return req, false
	}
	return req, true
}

func (a *app) saveCommonCodeGroup(w http.ResponseWriter, r *http.Request, id int64, familyID int64, req commonCodeGroupPayload) (commonCodeGroup, bool) {
	var item commonCodeGroup
	var createdAt time.Time
	var err error
	if id == 0 {
		err = a.db.QueryRow(r.Context(), `
			insert into common_code_groups (family_id, menu_key, code, name, active, created_at)
			values ($1,$2,$3,$4,$5,now())
			returning id, family_id, menu_key, code, name, active, created_at
		`, familyID, req.MenuKey, req.Code, req.Name, req.Active).
			Scan(&item.ID, &item.FamilyID, &item.MenuKey, &item.Code, &item.Name, &item.Active, &createdAt)
	} else {
		err = a.db.QueryRow(r.Context(), `
			update common_code_groups set menu_key=$1, code=$2, name=$3, active=$4
			where id=$5 and family_id=$6
			returning id, family_id, menu_key, code, name, active, created_at
		`, req.MenuKey, req.Code, req.Name, req.Active, id, familyID).
			Scan(&item.ID, &item.FamilyID, &item.MenuKey, &item.Code, &item.Name, &item.Active, &createdAt)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "common code group save failed")
		return item, false
	}
	item.CreatedAt = formatTime(createdAt)
	return item, true
}

func (a *app) saveCommonCode(w http.ResponseWriter, r *http.Request, id int64, groupID int64, req commonCodePayload) (commonCode, bool) {
	var item commonCode
	var createdAt time.Time
	var err error
	if id == 0 {
		err = a.db.QueryRow(r.Context(), `
			insert into common_codes (group_id, code, name, sort_order, active, created_at)
			values ($1,$2,$3,$4,$5,now())
			returning id, group_id, code, name, coalesce(sort_order, 0), active, created_at
		`, groupID, req.Code, req.Name, req.SortOrder, req.Active).
			Scan(&item.ID, &item.GroupID, &item.Code, &item.Name, &item.SortOrder, &item.Active, &createdAt)
	} else {
		err = a.db.QueryRow(r.Context(), `
			update common_codes set code=$1, name=$2, sort_order=$3, active=$4
			where id=$5 and group_id=$6
			returning id, group_id, code, name, coalesce(sort_order, 0), active, created_at
		`, req.Code, req.Name, req.SortOrder, req.Active, id, groupID).
			Scan(&item.ID, &item.GroupID, &item.Code, &item.Name, &item.SortOrder, &item.Active, &createdAt)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "common code save failed")
		return item, false
	}
	item.CreatedAt = formatTime(createdAt)
	return item, true
}

type tripPayload struct {
	Title       string  `json:"title"`
	StartDate   string  `json:"startDate"`
	EndDate     string  `json:"endDate"`
	Description *string `json:"description"`
}

func readTripPayload(w http.ResponseWriter, r *http.Request) (tripPayload, bool) {
	var req tripPayload
	if !readJSON(w, r, &req) {
		return req, false
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" || !validDate(req.StartDate) || !validDate(req.EndDate) {
		writeError(w, http.StatusBadRequest, "title, startDate and endDate are required")
		return req, false
	}
	if req.EndDate < req.StartDate {
		writeError(w, http.StatusBadRequest, "endDate cannot be before startDate")
		return req, false
	}
	return req, true
}

func (a *app) saveTrip(w http.ResponseWriter, r *http.Request, id int64, familyID int64, req tripPayload) (tripItem, bool) {
	var item tripItem
	var startDate, endDate, createdAt time.Time
	var description sql.NullString
	var err error
	if id == 0 {
		err = a.db.QueryRow(r.Context(), `
			insert into trips (family_id, title, start_date, end_date, description, created_at)
			values ($1,$2,$3,$4,$5,now())
			returning id, family_id, title, start_date, end_date, description, created_at
		`, familyID, req.Title, req.StartDate, req.EndDate, req.Description).
			Scan(&item.ID, &item.FamilyID, &item.Title, &startDate, &endDate, &description, &createdAt)
	} else {
		err = a.db.QueryRow(r.Context(), `
			update trips set title=$1, start_date=$2, end_date=$3, description=$4
			where id=$5 and family_id=$6
			returning id, family_id, title, start_date, end_date, description, created_at
		`, req.Title, req.StartDate, req.EndDate, req.Description, id, familyID).
			Scan(&item.ID, &item.FamilyID, &item.Title, &startDate, &endDate, &description, &createdAt)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "trip save failed")
		return item, false
	}
	item.StartDate = formatDate(startDate)
	item.EndDate = formatDate(endDate)
	item.Description = nullString(description)
	item.CreatedAt = formatTime(createdAt)
	return item, true
}

func scanTrips(w http.ResponseWriter, rows pgx.Rows) ([]tripItem, bool) {
	items := []tripItem{}
	for rows.Next() {
		var item tripItem
		var startDate, endDate, createdAt time.Time
		var description sql.NullString
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.Title, &startDate, &endDate, &description, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.StartDate = formatDate(startDate)
		item.EndDate = formatDate(endDate)
		item.Description = nullString(description)
		item.CreatedAt = formatTime(createdAt)
		items = append(items, item)
	}
	return items, true
}

type travelRecordPayload struct {
	SortOrder  *int     `json:"sortOrder"`
	Title      string   `json:"title"`
	Category   *string  `json:"category"`
	Amount     float64  `json:"amount"`
	Note       *string  `json:"note"`
	Location   string   `json:"location"`
	Latitude   float64  `json:"latitude"`
	Longitude  float64  `json:"longitude"`
	RecordDate string   `json:"recordDate"`
	RecordTime *string  `json:"recordTime"`
	MediaURLs  []string `json:"mediaUrls"`
}

func readTravelRecordPayload(w http.ResponseWriter, r *http.Request) (travelRecordPayload, bool) {
	var req travelRecordPayload
	if !readJSON(w, r, &req) {
		return req, false
	}
	req.Title = strings.TrimSpace(req.Title)
	req.Location = strings.TrimSpace(req.Location)
	if req.Title == "" || req.Location == "" || !validDate(req.RecordDate) {
		writeError(w, http.StatusBadRequest, "title, location and recordDate are required")
		return req, false
	}
	if req.RecordTime != nil && !validTimeText(strings.TrimSpace(*req.RecordTime)) {
		writeError(w, http.StatusBadRequest, "recordTime is invalid")
		return req, false
	}
	return req, true
}

func (a *app) saveTravelRecord(w http.ResponseWriter, r *http.Request, id int64, tripID int64, req travelRecordPayload) (travelRecordItem, bool) {
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return travelRecordItem{}, false
	}
	defer tx.Rollback(r.Context())
	var item travelRecordItem
	var sortOrder sql.NullInt32
	var category, note, recordTime sql.NullString
	var recordDate, createdAt time.Time
	if id == 0 {
		err = tx.QueryRow(r.Context(), `
			insert into travel_records (trip_id, sort_order, title, category, amount, note, location, latitude, longitude, record_date, record_time, created_at)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
			returning id, trip_id, sort_order, title, category, coalesce(amount, 0), note, location, latitude, longitude, record_date, record_time::text, created_at
		`, tripID, req.SortOrder, req.Title, req.Category, req.Amount, req.Note, req.Location, req.Latitude, req.Longitude, req.RecordDate, req.RecordTime).
			Scan(&item.ID, &item.TripID, &sortOrder, &item.Title, &category, &item.Amount, &note, &item.Location, &item.Latitude, &item.Longitude, &recordDate, &recordTime, &createdAt)
	} else {
		err = tx.QueryRow(r.Context(), `
			update travel_records set sort_order=$1, title=$2, category=$3, amount=$4, note=$5, location=$6, latitude=$7, longitude=$8, record_date=$9, record_time=$10
			where id=$11 and trip_id=$12
			returning id, trip_id, sort_order, title, category, coalesce(amount, 0), note, location, latitude, longitude, record_date, record_time::text, created_at
		`, req.SortOrder, req.Title, req.Category, req.Amount, req.Note, req.Location, req.Latitude, req.Longitude, req.RecordDate, req.RecordTime, id, tripID).
			Scan(&item.ID, &item.TripID, &sortOrder, &item.Title, &category, &item.Amount, &note, &item.Location, &item.Latitude, &item.Longitude, &recordDate, &recordTime, &createdAt)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "travel record save failed")
		return item, false
	}
	_, _ = tx.Exec(r.Context(), "delete from travel_record_media_urls where travel_record_id = $1", item.ID)
	for _, mediaURL := range req.MediaURLs {
		mediaURL = strings.TrimSpace(mediaURL)
		if mediaURL != "" {
			if _, err := tx.Exec(r.Context(), "insert into travel_record_media_urls (travel_record_id, media_urls) values ($1, $2)", item.ID, mediaURL); err != nil {
				writeError(w, http.StatusInternalServerError, "media save failed")
				return item, false
			}
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return item, false
	}
	item.SortOrder = nullInt(sortOrder)
	item.Category = nullString(category)
	item.Note = nullString(note)
	item.RecordDate = formatDate(recordDate)
	item.RecordTime = nullString(recordTime)
	item.MediaURLs = req.MediaURLs
	item.CreatedAt = formatTime(createdAt)
	return item, true
}

func (a *app) travelRecordsByTrip(w http.ResponseWriter, ctx context.Context, tripID int64) ([]travelRecordItem, bool) {
	rows, err := a.db.Query(ctx, `
		select id, trip_id, sort_order, title, category, coalesce(amount, 0), note, location, latitude, longitude, record_date, record_time::text, created_at
		from travel_records where trip_id = $1 order by sort_order asc nulls last, created_at desc
	`, tripID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return nil, false
	}
	defer rows.Close()
	items := []travelRecordItem{}
	for rows.Next() {
		var item travelRecordItem
		var sortOrder sql.NullInt32
		var category, note, recordTime sql.NullString
		var recordDate, createdAt time.Time
		if err := rows.Scan(&item.ID, &item.TripID, &sortOrder, &item.Title, &category, &item.Amount, &note, &item.Location, &item.Latitude, &item.Longitude, &recordDate, &recordTime, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.SortOrder = nullInt(sortOrder)
		item.Category = nullString(category)
		item.Note = nullString(note)
		item.RecordDate = formatDate(recordDate)
		item.RecordTime = nullString(recordTime)
		item.CreatedAt = formatTime(createdAt)
		item.MediaURLs = a.mediaURLs(ctx, "travel_record_media_urls", "travel_record_id", item.ID)
		items = append(items, item)
	}
	return items, true
}

func (a *app) mediaURLs(ctx context.Context, table string, key string, id int64) []string {
	query := fmt.Sprintf("select media_urls from %s where %s = $1", table, key)
	rows, err := a.db.Query(ctx, query, id)
	if err != nil {
		return []string{}
	}
	defer rows.Close()
	items := []string{}
	for rows.Next() {
		var value string
		if rows.Scan(&value) == nil {
			items = append(items, value)
		}
	}
	return items
}

func nullInt(value sql.NullInt32) *int {
	if !value.Valid {
		return nil
	}
	intValue := int(value.Int32)
	return &intValue
}
