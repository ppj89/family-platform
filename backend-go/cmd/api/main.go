package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

const (
	maxFailedLoginAttempts = 5
	lockDuration           = 5 * time.Minute
)

type config struct {
	port                      string
	databaseURL               string
	allowedOrigins            []string
	tokenSecret               []byte
	tokenValiditySeconds      int64
	mediaStorageDriver        string
	mediaStoragePath          string
	mediaPublicPrefix         string
	mediaS3Endpoint           string
	mediaS3Region             string
	mediaS3Bucket             string
	mediaS3AccessKey          string
	mediaS3SecretKey          string
	publicBaseURL             string
	oauth                     map[string]oauthProviderConfig
	maxFilesPerPost           int
	maxReferenceLength        int
	maxImageBytes             int64
	maxVideoBytes             int64
	emailVerificationRequired bool
	mailDailyLimit            int
	brevoAPIKey               string
	mailFromEmail             string
	mailFromName              string
	smtpHost                  string
	smtpPort                  string
	smtpUsername              string
	smtpPassword              string
	smtpFrom                  string
}

type oauthProviderConfig struct {
	name         string
	clientID     string
	clientSecret string
	secretNeeded bool
	authURL      string
	tokenURL     string
	userInfoURL  string
	scopes       []string
}

func (p oauthProviderConfig) isConfigured(publicBaseURL string) bool {
	if strings.TrimSpace(publicBaseURL) == "" || strings.TrimSpace(p.clientID) == "" {
		return false
	}
	return !p.secretNeeded || strings.TrimSpace(p.clientSecret) != ""
}

type app struct {
	cfg        config
	db         *pgxpool.Pool
	log        *slog.Logger
	mediaStore mediaStore
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

type oauthProfile struct {
	ProviderUserID string
	Email          string
	Nickname       string
}

var errActiveSessionExists = errors.New("active session exists")
var errOAuthEmailRequired = errors.New("oauth email consent is required")

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

	store, err := newMediaStore(ctx, cfg)
	if err != nil {
		logger.Error("media storage setup failed", "error", err)
		os.Exit(1)
	}
	api := &app{cfg: cfg, db: db, log: logger, mediaStore: store}
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
		port:                      getenv("PORT", "8080"),
		databaseURL:               databaseURL,
		allowedOrigins:            splitCSV(getenv("APP_CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")),
		tokenSecret:               []byte(secret),
		tokenValiditySeconds:      validity,
		mediaStorageDriver:        strings.ToLower(getenv("APP_MEDIA_STORAGE_DRIVER", "local")),
		mediaStoragePath:          getenv("APP_MEDIA_STORAGE_PATH", "uploads"),
		mediaPublicPrefix:         strings.TrimRight(getenv("APP_MEDIA_PUBLIC_URL_PREFIX", "/api/media/files"), "/"),
		mediaS3Endpoint:           strings.TrimRight(getenv("APP_MEDIA_S3_ENDPOINT", ""), "/"),
		mediaS3Region:             getenv("APP_MEDIA_S3_REGION", "auto"),
		mediaS3Bucket:             getenv("APP_MEDIA_S3_BUCKET", ""),
		mediaS3AccessKey:          getenv("APP_MEDIA_S3_ACCESS_KEY_ID", ""),
		mediaS3SecretKey:          getenv("APP_MEDIA_S3_SECRET_ACCESS_KEY", ""),
		publicBaseURL:             defaultPublicBaseURL(),
		oauth:                     loadOAuthProviders(),
		maxFilesPerPost:           envInt("APP_MEDIA_MAX_FILES_PER_POST", 6),
		maxReferenceLength:        envInt("APP_MEDIA_MAX_REFERENCE_LENGTH", 2048),
		maxImageBytes:             parseSize(getenv("APP_MEDIA_MAX_IMAGE_SIZE", "8MB"), 8*1024*1024),
		maxVideoBytes:             parseSize(getenv("APP_MEDIA_MAX_VIDEO_SIZE", "30MB"), 30*1024*1024),
		emailVerificationRequired: envBool("APP_AUTH_EMAIL_VERIFICATION_REQUIRED", false),
		mailDailyLimit:            envInt("APP_MAIL_DAILY_LIMIT_PER_IDENTIFIER", 3),
		brevoAPIKey:               getenv("APP_BREVO_API_KEY", ""),
		mailFromEmail:             getenv("APP_MAIL_FROM_EMAIL", ""),
		mailFromName:              getenv("APP_MAIL_FROM_NAME", "Family Platform"),
		smtpHost:                  getenv("APP_SMTP_HOST", ""),
		smtpPort:                  getenv("APP_SMTP_PORT", "587"),
		smtpUsername:              getenv("APP_SMTP_USERNAME", ""),
		smtpPassword:              getenv("APP_SMTP_PASSWORD", ""),
		smtpFrom:                  getenv("APP_SMTP_FROM", ""),
	}, nil
}

func loadOAuthProviders() map[string]oauthProviderConfig {
	return map[string]oauthProviderConfig{
		"google": {
			name:         "google",
			clientID:     getenv("APP_OAUTH_GOOGLE_CLIENT_ID", ""),
			clientSecret: getenv("APP_OAUTH_GOOGLE_CLIENT_SECRET", ""),
			secretNeeded: true,
			authURL:      "https://accounts.google.com/o/oauth2/v2/auth",
			tokenURL:     "https://oauth2.googleapis.com/token",
			userInfoURL:  "https://openidconnect.googleapis.com/v1/userinfo",
			scopes:       []string{"openid", "email", "profile"},
		},
		"naver": {
			name:         "naver",
			clientID:     getenv("APP_OAUTH_NAVER_CLIENT_ID", ""),
			clientSecret: getenv("APP_OAUTH_NAVER_CLIENT_SECRET", ""),
			secretNeeded: true,
			authURL:      "https://nid.naver.com/oauth2.0/authorize",
			tokenURL:     "https://nid.naver.com/oauth2.0/token",
			userInfoURL:  "https://openapi.naver.com/v1/nid/me",
			scopes:       []string{"email", "profile"},
		},
		"kakao": {
			name:         "kakao",
			clientID:     getenv("APP_OAUTH_KAKAO_CLIENT_ID", ""),
			clientSecret: getenv("APP_OAUTH_KAKAO_CLIENT_SECRET", ""),
			secretNeeded: false,
			authURL:      "https://kauth.kakao.com/oauth/authorize",
			tokenURL:     "https://kauth.kakao.com/oauth/token",
			userInfoURL:  "https://kapi.kakao.com/v2/user/me",
			scopes:       []string{"account_email", "profile_nickname"},
		},
	}
}

func defaultPublicBaseURL() string {
	if value := strings.TrimRight(strings.TrimSpace(os.Getenv("APP_PUBLIC_BASE_URL")), "/"); value != "" {
		return value
	}
	if domain := strings.TrimSpace(os.Getenv("APP_DOMAIN")); domain != "" {
		return "https://" + strings.Trim(domain, "/")
	}
	return "http://localhost:5173"
}

func (a *app) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", a.health)
	mux.HandleFunc("POST /api/auth/register", a.register)
	mux.HandleFunc("POST /api/auth/nickname/check", a.checkNickname)
	mux.HandleFunc("POST /api/auth/login", a.login)
	mux.HandleFunc("POST /api/auth/logout", a.requireAuth(a.logout))
	mux.HandleFunc("GET /api/auth/me", a.requireAuth(a.me))
	mux.HandleFunc("POST /api/auth/password/change", a.requireAuth(a.changePassword))
	mux.HandleFunc("GET /api/auth/verify-email", a.verifyEmail)
	mux.HandleFunc("POST /api/auth/verification/resend", a.resendVerificationEmail)
	mux.HandleFunc("POST /api/auth/recovery/find-email", a.findEmail)
	mux.HandleFunc("POST /api/auth/recovery/password/request", a.requestPasswordReset)
	mux.HandleFunc("POST /api/auth/recovery/password/reset", a.resetPassword)
	mux.HandleFunc("POST /api/auth/recovery/inquiry", a.createAccountRecoveryInquiry)
	mux.HandleFunc("GET /api/auth/oauth/providers", a.oauthProviders)
	mux.HandleFunc("GET /api/auth/oauth/{provider}/start", a.oauthStart)
	mux.HandleFunc("GET /api/auth/oauth/{provider}/callback", a.oauthCallback)
	mux.HandleFunc("GET /api/families", a.requireAuth(a.listFamilies))
	mux.HandleFunc("POST /api/families", a.requireAuth(a.createFamily))
	mux.HandleFunc("GET /api/families/{familyId}/members", a.requireAuth(a.listFamilyMembers))
	mux.HandleFunc("POST /api/families/{familyId}/members", a.requireAuth(a.addFamilyMember))
	mux.HandleFunc("PUT /api/families/{familyId}/members/{memberId}", a.requireAuth(a.updateFamilyMember))
	mux.HandleFunc("DELETE /api/families/{familyId}/members/{memberId}", a.requireAuth(a.deleteFamilyMember))
	mux.HandleFunc("GET /api/family-invitations", a.requireAuth(a.listFamilyInvitations))
	mux.HandleFunc("POST /api/families/{familyId}/invitations", a.requireAuth(a.createFamilyInvitation))
	mux.HandleFunc("POST /api/family-invitations/{invitationId}/accept", a.requireAuth(a.acceptFamilyInvitation))
	mux.HandleFunc("POST /api/family-invitations/{invitationId}/reject", a.requireAuth(a.rejectFamilyInvitation))
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
	mux.HandleFunc("GET /api/babies", a.requireAuth(a.listBabies))
	mux.HandleFunc("POST /api/babies", a.requireAuth(a.createBaby))
	mux.HandleFunc("PUT /api/babies/{babyId}", a.requireAuth(a.updateBaby))
	mux.HandleFunc("DELETE /api/babies/{babyId}", a.requireAuth(a.deleteBaby))
	mux.HandleFunc("GET /api/babies/{babyId}/records", a.requireAuth(a.listBabyRecords))
	mux.HandleFunc("POST /api/babies/{babyId}/records", a.requireAuth(a.createBabyRecord))
	mux.HandleFunc("PUT /api/baby-records/{recordId}", a.requireAuth(a.updateBabyRecord))
	mux.HandleFunc("DELETE /api/baby-records/{recordId}", a.requireAuth(a.deleteBabyRecord))
	mux.HandleFunc("GET /api/diaries", a.requireAuth(a.listDiaries))
	mux.HandleFunc("POST /api/diaries", a.requireAuth(a.createDiary))
	mux.HandleFunc("PUT /api/diaries/{diaryId}", a.requireAuth(a.updateDiary))
	mux.HandleFunc("DELETE /api/diaries/{diaryId}", a.requireAuth(a.deleteDiary))
	mux.HandleFunc("GET /api/community/posts", a.requireAuth(a.listCommunityPosts))
	mux.HandleFunc("POST /api/community/posts", a.requireAuth(a.createCommunityPost))
	mux.HandleFunc("GET /api/community/posts/best", a.requireAuth(a.listCommunityBestPosts))
	mux.HandleFunc("GET /api/community/posts/{postId}", a.requireAuth(a.getCommunityPost))
	mux.HandleFunc("PUT /api/community/posts/{postId}", a.requireAuth(a.updateCommunityPost))
	mux.HandleFunc("DELETE /api/community/posts/{postId}", a.requireAuth(a.deleteCommunityPost))
	mux.HandleFunc("POST /api/community/posts/{postId}/comments", a.requireAuth(a.createCommunityComment))
	mux.HandleFunc("PUT /api/community/comments/{commentId}", a.requireAuth(a.updateCommunityComment))
	mux.HandleFunc("DELETE /api/community/comments/{commentId}", a.requireAuth(a.deleteCommunityComment))
	mux.HandleFunc("POST /api/media", a.requireAuth(a.uploadMedia))
	mux.HandleFunc("GET /api/media/files/{fileName}", a.downloadMedia)
	mux.HandleFunc("GET /api/notifications", a.requireAuth(a.listNotifications))
	mux.HandleFunc("POST /api/notifications/schedule-reminders", a.requireAuth(a.createScheduleReminders))
	mux.HandleFunc("PATCH /api/notifications/{notificationId}/read", a.requireAuth(a.markNotificationRead))
	mux.HandleFunc("PATCH /api/notifications/read-all", a.requireAuth(a.markAllNotificationsRead))
	return a.securityHeaders(a.cors(mux))
}

func (a *app) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "UP", "runtime": "go"})
}

func isValidNickname(nickname string) bool {
	if nickname == "" || utf8.RuneCountInString(nickname) > 12 {
		return false
	}
	for _, r := range nickname {
		if r >= '0' && r <= '9' {
			continue
		}
		if r >= 'A' && r <= 'Z' {
			continue
		}
		if r >= 'a' && r <= 'z' {
			continue
		}
		if r >= '가' && r <= '힣' {
			continue
		}
		return false
	}
	return true
}

func (a *app) checkNickname(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Nickname string `json:"nickname"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	nickname := strings.TrimSpace(req.Nickname)
	if nickname == "" {
		writeError(w, http.StatusBadRequest, "nickname is required")
		return
	}
	if !isValidNickname(nickname) {
		writeError(w, http.StatusBadRequest, "nickname format invalid")
		return
	}
	var exists bool
	if err := a.db.QueryRow(r.Context(), "select exists(select 1 from app_users where lower(nickname) = lower($1))", nickname).Scan(&exists); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"available": !exists,
		"nickname":  nickname,
	})
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
	if !isValidNickname(nickname) {
		writeError(w, http.StatusBadRequest, "nickname format invalid")
		return
	}
	var nicknameExists bool
	if err := a.db.QueryRow(r.Context(), "select exists(select 1 from app_users where lower(nickname) = lower($1))", nickname).Scan(&nicknameExists); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	if nicknameExists {
		writeError(w, http.StatusConflict, "nickname is already registered")
		return
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password hashing failed")
		return
	}
	requiresEmailVerification := a.cfg.emailVerificationRequired
	sessionID := ""
	if !requiresEmailVerification {
		sessionID = newSessionID()
	}

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
		insert into app_users (created_at, email, nickname, platform_admin, password_hash, active_session_id, failed_login_attempts, email_verification_required, email_verified_at)
		values (now(), $1, $2, $3, $4, $5, 0, $6, case when $6 then null else now() end)
		returning id
	`, email, nickname, userCount == 0, string(passwordHash), sessionID, requiresEmailVerification).Scan(&userID)
	if err != nil {
		writeError(w, http.StatusConflict, "email is already registered")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return
	}
	a.recordLoginHistory(r.Context(), &userID, email, "password", "REGISTER", "SUCCESS", "")
	if requiresEmailVerification {
		if err := a.createAndSendEmailVerification(r.Context(), userID, email, nickname); err != nil {
			a.log.Error("email verification dispatch failed", "email", email, "error", err)
		}
		writeJSON(w, http.StatusAccepted, map[string]any{
			"email":                     email,
			"nickname":                  nickname,
			"emailVerificationRequired": true,
			"message":                   "email verification required",
		})
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
	identifier := strings.TrimSpace(req.Email)
	email := normalizeEmail(identifier)
	loginID := normalizeLoginID(identifier)
	var userID int64
	var nickname, passwordHash, accountEmail, accountLoginID string
	var platformAdmin bool
	var activeSessionID sql.NullString
	var lockedUntil sql.NullTime
	var emailVerifiedAt sql.NullTime
	var emailVerificationRequired bool
	var failedAttempts int
	err := a.db.QueryRow(r.Context(), `
		select id, coalesce(email, ''), coalesce(login_id, ''), nickname, platform_admin, coalesce(password_hash, ''), active_session_id, locked_until, coalesce(failed_login_attempts, 0), email_verified_at, coalesce(email_verification_required, false)
		from app_users
		where lower(email) = lower($1)
		   or (platform_admin = true and lower(login_id) = lower($2))
		order by case when lower(email) = lower($1) then 0 else 1 end
		limit 1
	`, email, loginID).Scan(&userID, &accountEmail, &accountLoginID, &nickname, &platformAdmin, &passwordHash, &activeSessionID, &lockedUntil, &failedAttempts, &emailVerifiedAt, &emailVerificationRequired)
	loginName := firstNonEmpty(accountEmail, accountLoginID, identifier)
	if err != nil {
		a.recordLoginHistory(r.Context(), nil, identifier, "password", "LOGIN", "FAIL", "invalid identifier")
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if lockedUntil.Valid && lockedUntil.Time.After(time.Now()) {
		a.recordLoginHistory(r.Context(), &userID, loginName, "password", "LOGIN", "LOCKED", "account is locked")
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
		a.recordLoginHistory(r.Context(), &userID, loginName, "password", "LOGIN", "FAIL", "invalid password")
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if emailVerificationRequired && !emailVerifiedAt.Valid {
		a.recordLoginHistory(r.Context(), &userID, loginName, "password", "LOGIN", "VERIFY_REQUIRED", "email verification required")
		writeError(w, http.StatusForbidden, "email verification required")
		return
	}
	if activeSessionID.Valid && activeSessionID.String != "" && !req.ForceLogin {
		a.recordLoginHistory(r.Context(), &userID, loginName, "password", "LOGIN", "ACTIVE_SESSION", "active session exists")
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
	a.recordLoginHistory(r.Context(), &userID, loginName, "password", "LOGIN", "SUCCESS", "")
	user := authUser{ID: userID, Email: loginName, PlatformAdmin: platformAdmin, SessionID: sessionID}
	writeJSON(w, http.StatusOK, authResponse{
		AccessToken:   a.issueToken(user),
		UserID:        userID,
		Email:         loginName,
		Nickname:      nickname,
		PlatformAdmin: platformAdmin,
	})
}

func (a *app) logout(w http.ResponseWriter, r *http.Request, user authUser) {
	_, _ = a.db.Exec(r.Context(), "update app_users set active_session_id = null where id = $1 and active_session_id = $2", user.ID, user.SessionID)
	a.recordLoginHistory(r.Context(), &user.ID, user.Email, "password", "LOGOUT", "SUCCESS", "")
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) me(w http.ResponseWriter, r *http.Request, user authUser) {
	var nickname, loginName string
	err := a.db.QueryRow(r.Context(), "select nickname, coalesce(email, login_id, '') from app_users where id = $1", user.ID).Scan(&nickname, &loginName)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid session")
		return
	}
	if loginName == "" {
		loginName = user.Email
	}
	writeJSON(w, http.StatusOK, authResponse{
		AccessToken:   a.issueToken(user),
		UserID:        user.ID,
		Email:         loginName,
		Nickname:      nickname,
		PlatformAdmin: user.PlatformAdmin,
	})
}

func (a *app) changePassword(w http.ResponseWriter, r *http.Request, user authUser) {
	var req struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if len(req.NewPassword) < 8 {
		writeError(w, http.StatusBadRequest, "new password length >= 8 is required")
		return
	}
	var currentHash string
	err := a.db.QueryRow(r.Context(), "select coalesce(password_hash, '') from app_users where id = $1", user.ID).Scan(&currentHash)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid session")
		return
	}
	if currentHash != "" && bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.CurrentPassword)) != nil {
		a.recordLoginHistory(r.Context(), &user.ID, user.Email, "password", "PASSWORD_CHANGE", "FAIL", "invalid current password")
		writeError(w, http.StatusUnauthorized, "current password is invalid")
		return
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password hashing failed")
		return
	}
	_, err = a.db.Exec(r.Context(), `
		update app_users
		set password_hash = $1,
		    failed_login_attempts = 0,
		    locked_until = null,
		    email_verified_at = coalesce(email_verified_at, now()),
		    email_verification_required = false
		where id = $2
	`, string(passwordHash), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password change failed")
		return
	}
	a.recordLoginHistory(r.Context(), &user.ID, user.Email, "password", "PASSWORD_CHANGE", "SUCCESS", "")
	writeJSON(w, http.StatusOK, map[string]string{"message": "password changed"})
}

func (a *app) oauthProviders(w http.ResponseWriter, r *http.Request) {
	type providerStatus struct {
		Provider   string `json:"provider"`
		Configured bool   `json:"configured"`
		StartURL   string `json:"startUrl"`
	}
	items := []providerStatus{}
	for _, providerName := range []string{"naver", "google", "kakao"} {
		provider, ok := a.cfg.oauth[providerName]
		if !ok {
			continue
		}
		configured := provider.isConfigured(a.cfg.publicBaseURL)
		items = append(items, providerStatus{
			Provider:   providerName,
			Configured: configured,
			StartURL:   "/api/auth/oauth/" + providerName + "/start",
		})
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) oauthStart(w http.ResponseWriter, r *http.Request) {
	providerName := strings.ToLower(strings.TrimSpace(r.PathValue("provider")))
	provider, ok := a.cfg.oauth[providerName]
	if !ok {
		writeError(w, http.StatusNotFound, "oauth provider not supported")
		return
	}
	if !provider.isConfigured(a.cfg.publicBaseURL) {
		writeError(w, http.StatusServiceUnavailable, "oauth provider is not configured")
		return
	}

	state := newSessionID()
	nonce := newSessionID()
	_, err := a.db.Exec(r.Context(), `
		insert into oauth_login_states (state, provider, nonce, created_at, expires_at)
		values ($1, $2, $3, now(), $4)
	`, state, providerName, nonce, time.Now().Add(10*time.Minute))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "oauth state creation failed")
		return
	}

	params := url.Values{}
	params.Set("client_id", provider.clientID)
	params.Set("redirect_uri", a.oauthRedirectURL(providerName))
	params.Set("response_type", "code")
	params.Set("state", state)
	if providerName == "google" {
		params.Set("nonce", nonce)
	}
	if len(provider.scopes) > 0 {
		params.Set("scope", strings.Join(provider.scopes, " "))
	}
	if providerName == "naver" {
		params.Del("scope")
	}
	http.Redirect(w, r, provider.authURL+"?"+params.Encode(), http.StatusFound)
}

func (a *app) oauthCallback(w http.ResponseWriter, r *http.Request) {
	providerName := strings.ToLower(strings.TrimSpace(r.PathValue("provider")))
	provider, ok := a.cfg.oauth[providerName]
	if !ok {
		writeError(w, http.StatusNotFound, "oauth provider not supported")
		return
	}
	if !provider.isConfigured(a.cfg.publicBaseURL) {
		writeError(w, http.StatusServiceUnavailable, "oauth provider is not configured")
		return
	}
	if errMessage := strings.TrimSpace(r.URL.Query().Get("error")); errMessage != "" {
		writeError(w, http.StatusBadRequest, "oauth provider error: "+errMessage)
		return
	}
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	state := strings.TrimSpace(r.URL.Query().Get("state"))
	if code == "" || state == "" {
		writeError(w, http.StatusBadRequest, "oauth code and state are required")
		return
	}
	if !a.consumeOAuthState(r.Context(), providerName, state) {
		writeError(w, http.StatusBadRequest, "oauth state is invalid or expired")
		return
	}

	accessToken, err := a.exchangeOAuthCode(r.Context(), providerName, provider, code)
	if err != nil {
		a.log.Error("oauth token exchange failed", "provider", providerName, "error", err)
		a.recordLoginHistory(r.Context(), nil, "", providerName, "SSO_LOGIN", "FAIL", "token exchange failed")
		writeError(w, http.StatusBadGateway, "oauth token exchange failed")
		return
	}
	profile, err := a.fetchOAuthProfile(r.Context(), providerName, provider, accessToken)
	if err != nil {
		a.log.Error("oauth profile fetch failed", "provider", providerName, "error", err)
		a.recordLoginHistory(r.Context(), nil, "", providerName, "SSO_LOGIN", "FAIL", "profile fetch failed")
		writeError(w, http.StatusBadGateway, "oauth profile fetch failed")
		return
	}
	if profile.ProviderUserID == "" {
		a.recordLoginHistory(r.Context(), nil, profile.Email, providerName, "SSO_LOGIN", "FAIL", "missing provider id")
		writeError(w, http.StatusBadGateway, "oauth profile is missing provider id")
		return
	}
	response, err := a.loginOAuthUser(r.Context(), providerName, profile, true)
	if errors.Is(err, errActiveSessionExists) {
		a.recordLoginHistory(r.Context(), nil, profile.Email, providerName, "SSO_LOGIN", "ACTIVE_SESSION", "active session exists")
		writeOAuthCallbackHTML(w, http.StatusConflict, a.cfg.publicBaseURL, "", nil, "active session exists")
		return
	}
	if errors.Is(err, errOAuthEmailRequired) {
		a.recordLoginHistory(r.Context(), nil, profile.Email, providerName, "SSO_LOGIN", "EMAIL_REQUIRED", "email consent is required")
		writeOAuthCallbackHTML(w, http.StatusForbidden, a.cfg.publicBaseURL, "", nil, "oauth email consent required")
		return
	}
	if err != nil {
		a.log.Error("oauth login failed", "provider", providerName, "error", err)
		a.recordLoginHistory(r.Context(), nil, profile.Email, providerName, "SSO_LOGIN", "FAIL", "oauth login failed")
		writeOAuthCallbackHTML(w, http.StatusInternalServerError, a.cfg.publicBaseURL, "", nil, "oauth login failed")
		return
	}
	a.recordLoginHistory(r.Context(), &response.UserID, response.Email, providerName, "SSO_LOGIN", "SUCCESS", "")
	userPayload := map[string]any{
		"userId":        response.UserID,
		"email":         response.Email,
		"nickname":      response.Nickname,
		"platformAdmin": response.PlatformAdmin,
	}
	writeOAuthCallbackHTML(w, http.StatusOK, a.cfg.publicBaseURL, response.AccessToken, userPayload, "")
}

func (a *app) verifyEmail(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		writeEmailVerificationHTML(w, http.StatusBadRequest, a.cfg.publicBaseURL, false, "인증 토큰이 없습니다.")
		return
	}
	tokenHash := verificationTokenHash(token)
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeEmailVerificationHTML(w, http.StatusInternalServerError, a.cfg.publicBaseURL, false, "데이터베이스 연결에 실패했습니다.")
		return
	}
	defer tx.Rollback(r.Context())

	var tokenID, userID int64
	var email string
	err = tx.QueryRow(r.Context(), `
		select t.id, u.id, u.email
		from email_verification_tokens t
		join app_users u on u.id = t.user_id
		where t.token_hash = $1 and t.used_at is null and t.expires_at > now()
		for update
	`, tokenHash).Scan(&tokenID, &userID, &email)
	if err != nil {
		a.recordLoginHistory(r.Context(), nil, "", "password", "EMAIL_VERIFY", "FAIL", "invalid or expired token")
		writeEmailVerificationHTML(w, http.StatusBadRequest, a.cfg.publicBaseURL, false, "인증 링크가 만료되었거나 올바르지 않습니다.")
		return
	}
	if _, err := tx.Exec(r.Context(), `
		update app_users
		set email_verified_at = now(), email_verification_required = false
		where id = $1
	`, userID); err != nil {
		writeEmailVerificationHTML(w, http.StatusInternalServerError, a.cfg.publicBaseURL, false, "이메일 인증 처리에 실패했습니다.")
		return
	}
	if _, err := tx.Exec(r.Context(), "update email_verification_tokens set used_at = now() where id = $1", tokenID); err != nil {
		writeEmailVerificationHTML(w, http.StatusInternalServerError, a.cfg.publicBaseURL, false, "이메일 인증 처리에 실패했습니다.")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeEmailVerificationHTML(w, http.StatusInternalServerError, a.cfg.publicBaseURL, false, "이메일 인증 처리에 실패했습니다.")
		return
	}
	a.recordLoginHistory(r.Context(), &userID, email, "password", "EMAIL_VERIFY", "SUCCESS", "")
	writeEmailVerificationHTML(w, http.StatusOK, a.cfg.publicBaseURL, true, "이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다.")
}

func (a *app) resendVerificationEmail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	email := normalizeEmail(req.Email)
	if email == "" {
		writeJSON(w, http.StatusAccepted, map[string]string{"message": "verification email accepted"})
		return
	}
	allowed, err := a.reserveMailAttempt(r.Context(), email, clientIP(r), "email_verification")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "mail rate limit check failed")
		return
	}
	if !allowed {
		writeError(w, http.StatusTooManyRequests, "daily mail request limit exceeded")
		return
	}
	var userID int64
	var nickname string
	var verifiedAt sql.NullTime
	var required bool
	err = a.db.QueryRow(r.Context(), `
		select id, nickname, email_verified_at, coalesce(email_verification_required, false)
		from app_users
		where email = $1
	`, email).Scan(&userID, &nickname, &verifiedAt, &required)
	if err == nil && required && !verifiedAt.Valid {
		if sendErr := a.createAndSendEmailVerification(r.Context(), userID, email, nickname); sendErr != nil {
			a.log.Error("email verification resend failed", "email", email, "error", sendErr)
		}
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"message": "verification email accepted"})
}

func (a *app) findEmail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Nickname string `json:"nickname"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	nickname := strings.TrimSpace(req.Nickname)
	if nickname == "" {
		writeError(w, http.StatusBadRequest, "nickname is required")
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select email
		from app_users
		where lower(nickname) = lower($1)
		order by created_at desc
		limit 5
	`, nickname)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	emails := []string{}
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			writeError(w, http.StatusInternalServerError, "database read failed")
			return
		}
		emails = append(emails, maskEmail(email))
	}
	if rows.Err() != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"emails": emails})
}

func (a *app) requestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	email := normalizeEmail(req.Email)
	if email == "" {
		writeJSON(w, http.StatusAccepted, map[string]string{"message": "password reset accepted"})
		return
	}
	allowed, limitErr := a.reserveMailAttempt(r.Context(), email, clientIP(r), "password_reset")
	if limitErr != nil {
		writeError(w, http.StatusInternalServerError, "mail rate limit check failed")
		return
	}
	if !allowed {
		writeError(w, http.StatusTooManyRequests, "daily mail request limit exceeded")
		return
	}
	var userID int64
	var nickname string
	err := a.db.QueryRow(r.Context(), "select id, nickname from app_users where email = $1", email).Scan(&userID, &nickname)
	if err == nil {
		if sendErr := a.createAndSendPasswordReset(r.Context(), userID, email, nickname); sendErr != nil {
			a.log.Error("password reset dispatch failed", "email", email, "error", sendErr)
		}
		a.recordLoginHistory(r.Context(), &userID, email, "password", "PASSWORD_RESET_REQUEST", "SUCCESS", "")
	} else if !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"message": "password reset accepted"})
}

func (a *app) resetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	token := strings.TrimSpace(req.Token)
	if token == "" || len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "token and password length >= 8 are required")
		return
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password hashing failed")
		return
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return
	}
	defer tx.Rollback(r.Context())

	var tokenID, userID int64
	var email string
	err = tx.QueryRow(r.Context(), `
		select t.id, u.id, u.email
		from password_reset_tokens t
		join app_users u on u.id = t.user_id
		where t.token_hash = $1 and t.used_at is null and t.expires_at > now()
		for update
	`, verificationTokenHash(token)).Scan(&tokenID, &userID, &email)
	if err != nil {
		a.recordLoginHistory(r.Context(), nil, "", "password", "PASSWORD_RESET", "FAIL", "invalid or expired token")
		writeError(w, http.StatusBadRequest, "invalid or expired password reset token")
		return
	}
	if _, err := tx.Exec(r.Context(), `
		update app_users
		set password_hash = $1,
		    active_session_id = null,
		    failed_login_attempts = 0,
		    locked_until = null,
		    email_verified_at = coalesce(email_verified_at, now()),
		    email_verification_required = false
		where id = $2
	`, string(passwordHash), userID); err != nil {
		writeError(w, http.StatusInternalServerError, "password reset failed")
		return
	}
	if _, err := tx.Exec(r.Context(), "update password_reset_tokens set used_at = now() where id = $1", tokenID); err != nil {
		writeError(w, http.StatusInternalServerError, "password reset failed")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return
	}
	a.recordLoginHistory(r.Context(), &userID, email, "password", "PASSWORD_RESET", "SUCCESS", "")
	writeJSON(w, http.StatusOK, map[string]string{"message": "password reset completed"})
}

func (a *app) createAccountRecoveryInquiry(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email        string `json:"email"`
		Nickname     string `json:"nickname"`
		Contact      string `json:"contact"`
		RecoveryType string `json:"recoveryType"`
		Message      string `json:"message"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	email := normalizeEmail(req.Email)
	nickname := strings.TrimSpace(req.Nickname)
	contact := strings.TrimSpace(req.Contact)
	recoveryType := strings.TrimSpace(req.RecoveryType)
	message := strings.TrimSpace(req.Message)
	if contact == "" && email == "" {
		writeError(w, http.StatusBadRequest, "email or contact is required")
		return
	}
	if recoveryType == "" {
		recoveryType = "account recovery"
	}
	if len(message) > 2000 {
		writeError(w, http.StatusBadRequest, "message is too long")
		return
	}
	allowed, limitErr := a.reserveMailAttempt(r.Context(), firstNonEmpty(email, contact), clientIP(r), "account_recovery_inquiry")
	if limitErr != nil {
		writeError(w, http.StatusInternalServerError, "mail rate limit check failed")
		return
	}
	if !allowed {
		writeError(w, http.StatusTooManyRequests, "daily mail request limit exceeded")
		return
	}
	var inquiryID int64
	if err := a.db.QueryRow(r.Context(), `
		insert into account_recovery_inquiries (created_at, email, nickname, contact, recovery_type, message, status)
		values (now(), $1, $2, $3, $4, $5, 'OPEN')
		returning id
	`, email, nickname, contact, recoveryType, message).Scan(&inquiryID); err != nil {
		writeError(w, http.StatusInternalServerError, "account recovery inquiry failed")
		return
	}
	if err := a.sendRecoveryInquiryEmail(inquiryID, email, nickname, contact, recoveryType, message); err != nil {
		a.log.Error("account recovery inquiry mail failed", "inquiryId", inquiryID, "error", err)
	}
	a.recordLoginHistory(r.Context(), nil, email, "password", "ACCOUNT_RECOVERY_INQUIRY", "SUCCESS", "")
	writeJSON(w, http.StatusAccepted, map[string]any{"message": "account recovery inquiry accepted", "id": inquiryID})
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

func (a *app) createFamily(w http.ResponseWriter, r *http.Request, user authUser) {
	var req struct {
		Name string `json:"name"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		var nickname string
		if err := a.db.QueryRow(r.Context(), "select nickname from app_users where id = $1", user.ID).Scan(&nickname); err != nil {
			writeError(w, http.StatusInternalServerError, "database read failed")
			return
		}
		name = nickname + " 가족"
	}

	var memberCount int
	if err := a.db.QueryRow(r.Context(), "select count(1) from family_members where user_id = $1", user.ID).Scan(&memberCount); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	if memberCount > 0 {
		writeError(w, http.StatusConflict, "user already belongs to a family")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return
	}
	defer tx.Rollback(r.Context())

	var familyID int64
	var createdAt time.Time
	if err := tx.QueryRow(r.Context(), `
		insert into family_groups (created_at, name)
		values (now(), $1)
		returning id, created_at
	`, name).Scan(&familyID, &createdAt); err != nil {
		writeError(w, http.StatusInternalServerError, "family creation failed")
		return
	}
	if _, err := tx.Exec(r.Context(), `
		insert into family_members (family_id, user_id, role, joined_at, can_read, can_create, can_update, can_delete)
		values ($1, $2, 'FAMILY_ADMIN', now(), true, true, true, true)
	`, familyID, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "family membership creation failed")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":        familyID,
		"createdAt": createdAt,
		"name":      name,
	})
}

type familyMember struct {
	ID        int64  `json:"id"`
	FamilyID  int64  `json:"familyId"`
	UserID    int64  `json:"userId"`
	Email     string `json:"email,omitempty"`
	Nickname  string `json:"nickname,omitempty"`
	Role      string `json:"role"`
	CanRead   bool   `json:"canRead"`
	CanCreate bool   `json:"canCreate"`
	CanUpdate bool   `json:"canUpdate"`
	CanDelete bool   `json:"canDelete"`
	JoinedAt  string `json:"joinedAt"`
}

type familyInvitation struct {
	ID             int64  `json:"id"`
	FamilyID       int64  `json:"familyId"`
	FamilyName     string `json:"familyName"`
	InviterUserID  int64  `json:"inviterUserId"`
	InviterName    string `json:"inviterName,omitempty"`
	InviteeUserID  int64  `json:"inviteeUserId"`
	InviteeEmail   string `json:"inviteeEmail,omitempty"`
	InviteeName    string `json:"inviteeName,omitempty"`
	Role           string `json:"role"`
	CanRead        bool   `json:"canRead"`
	CanCreate      bool   `json:"canCreate"`
	CanUpdate      bool   `json:"canUpdate"`
	CanDelete      bool   `json:"canDelete"`
	Status         string `json:"status"`
	CreatedAt      string `json:"createdAt"`
	RespondedAt    string `json:"respondedAt,omitempty"`
}

func (a *app) listFamilyMembers(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := pathID(w, r, "familyId")
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select m.id, m.family_id, m.user_id, coalesce(u.email, ''), coalesce(u.nickname, ''), m.role, m.can_read, m.can_create, m.can_update, m.can_delete, m.joined_at
		from family_members m
		left join app_users u on u.id = m.user_id
		where m.family_id = $1
		order by m.joined_at asc
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
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.UserID, &item.Email, &item.Nickname, &item.Role, &item.CanRead, &item.CanCreate, &item.CanUpdate, &item.CanDelete, &joinedAt); err != nil {
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
	if !ok || !a.requireFamilyAdmin(w, r.Context(), user, familyID) {
		return
	}
	var req struct {
		UserID    int64  `json:"userId"`
		Invite    string `json:"invite"`
		Role      string `json:"role"`
		CanRead   bool   `json:"canRead"`
		CanCreate bool   `json:"canCreate"`
		CanUpdate bool   `json:"canUpdate"`
		CanDelete bool   `json:"canDelete"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if req.UserID <= 0 {
		invite := strings.TrimSpace(req.Invite)
		if invite == "" {
			writeError(w, http.StatusBadRequest, "user invite is required")
			return
		}
		err := a.db.QueryRow(r.Context(), `
			select id from app_users
			where lower(coalesce(email, '')) = lower($1)
			   or lower(coalesce(nickname, '')) = lower($1)
			   or lower(coalesce(login_id, '')) = lower($1)
			order by id asc
			limit 1
		`, invite).Scan(&req.UserID)
		if err != nil {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
	}
	var memberCount int
	if err := a.db.QueryRow(r.Context(), "select count(1) from family_members where user_id = $1", req.UserID).Scan(&memberCount); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	if memberCount > 0 {
		writeError(w, http.StatusConflict, "user already belongs to a family")
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
	_ = a.db.QueryRow(r.Context(), "select coalesce(email, ''), coalesce(nickname, '') from app_users where id = $1", item.UserID).Scan(&item.Email, &item.Nickname)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateFamilyMember(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := pathID(w, r, "familyId")
	memberID, ok2 := pathID(w, r, "memberId")
	if !ok || !ok2 || !a.requireFamilyAdmin(w, r.Context(), user, familyID) {
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
	nextRole := emptyDefault(req.Role, "MEMBER")
	var currentRole string
	var familyAdminCount int
	if err := a.db.QueryRow(r.Context(), `
		select role,
		       (select count(1) from family_members where family_id = $1 and role = 'FAMILY_ADMIN')
		from family_members
		where id = $2 and family_id = $1
	`, familyID, memberID).Scan(&currentRole, &familyAdminCount); err != nil {
		writeError(w, http.StatusNotFound, "family member not found")
		return
	}
	if currentRole == "FAMILY_ADMIN" && nextRole != "FAMILY_ADMIN" && familyAdminCount <= 1 {
		writeError(w, http.StatusConflict, "at least one family admin required")
		return
	}
	var item familyMember
	var joinedAt time.Time
	err := a.db.QueryRow(r.Context(), `
		update family_members set user_id = $1, role = $2, can_read = $3, can_create = $4, can_update = $5, can_delete = $6
		where id = $7 and family_id = $8
		returning id, family_id, user_id, role, can_read, can_create, can_update, can_delete, joined_at
	`, req.UserID, nextRole, req.CanRead, req.CanCreate, req.CanUpdate, req.CanDelete, memberID, familyID).
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
	if !ok || !ok2 {
		return
	}
	var memberUserID int64
	err := a.db.QueryRow(r.Context(), "select user_id from family_members where id = $1 and family_id = $2", memberID, familyID).Scan(&memberUserID)
	if err != nil {
		writeError(w, http.StatusNotFound, "family member not found")
		return
	}
	if memberUserID != user.ID && !a.requireFamilyAdmin(w, r.Context(), user, familyID) {
		return
	}
	tag, err := a.db.Exec(r.Context(), "delete from family_members where id = $1 and family_id = $2", memberID, familyID)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "family member not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) listFamilyInvitations(w http.ResponseWriter, r *http.Request, user authUser) {
	rows, err := a.db.Query(r.Context(), `
		select i.id, i.family_id, coalesce(f.name, ''), i.inviter_user_id, coalesce(inviter.nickname, ''), i.invitee_user_id,
		       coalesce(invitee.email, ''), coalesce(invitee.nickname, ''), i.role, i.can_read, i.can_create, i.can_update, i.can_delete,
		       i.status, i.created_at, i.responded_at
		from family_invitations i
		left join family_groups f on f.id = i.family_id
		left join app_users inviter on inviter.id = i.inviter_user_id
		left join app_users invitee on invitee.id = i.invitee_user_id
		where i.invitee_user_id = $1 and i.status = 'PENDING'
		order by i.created_at desc
	`, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items := []familyInvitation{}
	for rows.Next() {
		item, ok := scanFamilyInvitation(w, rows)
		if !ok {
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) createFamilyInvitation(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := pathID(w, r, "familyId")
	if !ok || !a.requireFamilyAdmin(w, r.Context(), user, familyID) {
		return
	}
	var req struct {
		Invite    string `json:"invite"`
		Role      string `json:"role"`
		CanRead   bool   `json:"canRead"`
		CanCreate bool   `json:"canCreate"`
		CanUpdate bool   `json:"canUpdate"`
		CanDelete bool   `json:"canDelete"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	invite := strings.TrimSpace(req.Invite)
	if invite == "" {
		writeError(w, http.StatusBadRequest, "invitee is required")
		return
	}
	var inviteeID int64
	err := a.db.QueryRow(r.Context(), `
		select id from app_users
		where lower(coalesce(email, '')) = lower($1)
		   or lower(coalesce(nickname, '')) = lower($1)
		   or lower(coalesce(login_id, '')) = lower($1)
		order by id asc
		limit 1
	`, invite).Scan(&inviteeID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if inviteeID == user.ID {
		writeError(w, http.StatusBadRequest, "cannot invite yourself")
		return
	}
	var memberCount int
	if err := a.db.QueryRow(r.Context(), "select count(1) from family_members where user_id = $1", inviteeID).Scan(&memberCount); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	if memberCount > 0 {
		writeError(w, http.StatusConflict, "user already belongs to a family")
		return
	}
	var pendingCount int
	if err := a.db.QueryRow(r.Context(), "select count(1) from family_invitations where family_id = $1 and invitee_user_id = $2 and status = 'PENDING'", familyID, inviteeID).Scan(&pendingCount); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	if pendingCount > 0 {
		writeError(w, http.StatusConflict, "invitation already exists")
		return
	}
	row := a.db.QueryRow(r.Context(), `
		insert into family_invitations (family_id, inviter_user_id, invitee_user_id, role, can_read, can_create, can_update, can_delete, status, created_at)
		values ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', now())
		returning id, family_id, '', inviter_user_id, '', invitee_user_id, '', '', role, can_read, can_create, can_update, can_delete, status, created_at, responded_at
	`, familyID, user.ID, inviteeID, emptyDefault(req.Role, "MEMBER"), req.CanRead, req.CanCreate, req.CanUpdate, req.CanDelete)
	item, ok := scanFamilyInvitation(w, row)
	if !ok {
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) acceptFamilyInvitation(w http.ResponseWriter, r *http.Request, user authUser) {
	invitationID, ok := pathID(w, r, "invitationId")
	if !ok {
		return
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return
	}
	defer tx.Rollback(r.Context())

	var familyID int64
	var role string
	var canRead, canCreate, canUpdate, canDelete bool
	err = tx.QueryRow(r.Context(), `
		select family_id, role, can_read, can_create, can_update, can_delete
		from family_invitations
		where id = $1 and invitee_user_id = $2 and status = 'PENDING'
		for update
	`, invitationID, user.ID).Scan(&familyID, &role, &canRead, &canCreate, &canUpdate, &canDelete)
	if err != nil {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}
	var memberCount int
	if err := tx.QueryRow(r.Context(), "select count(1) from family_members where user_id = $1", user.ID).Scan(&memberCount); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	if memberCount > 0 {
		writeError(w, http.StatusConflict, "user already belongs to a family")
		return
	}
	if _, err := tx.Exec(r.Context(), `
		insert into family_members (family_id, user_id, role, joined_at, can_read, can_create, can_update, can_delete)
		values ($1, $2, $3, now(), $4, $5, $6, $7)
	`, familyID, user.ID, emptyDefault(role, "MEMBER"), canRead, canCreate, canUpdate, canDelete); err != nil {
		writeError(w, http.StatusInternalServerError, "family membership creation failed")
		return
	}
	if _, err := tx.Exec(r.Context(), "update family_invitations set status = 'ACCEPTED', responded_at = now() where id = $1", invitationID); err != nil {
		writeError(w, http.StatusInternalServerError, "invitation update failed")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"familyId": familyID, "status": "ACCEPTED"})
}

func (a *app) rejectFamilyInvitation(w http.ResponseWriter, r *http.Request, user authUser) {
	invitationID, ok := pathID(w, r, "invitationId")
	if !ok {
		return
	}
	tag, err := a.db.Exec(r.Context(), `
		update family_invitations
		set status = 'REJECTED', responded_at = now()
		where id = $1 and invitee_user_id = $2 and status = 'PENDING'
	`, invitationID, user.ID)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "REJECTED"})
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
		where family_id = $1 and transaction_date between $2 and $3 and deleted_at is null
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
		where family_id = $1 and transaction_date between $2 and $3 and deleted_at is null
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
	a.recordDataChange(r.Context(), "ledger_entry", item.ID, familyID, user.ID, "create", item)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateLedgerEntry(w http.ResponseWriter, r *http.Request, user authUser) {
	entryID, ok := pathID(w, r, "entryId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from ledger_entries where id = $1 and deleted_at is null", entryID)
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
	a.recordDataChange(r.Context(), "ledger_entry", item.ID, familyID, user.ID, "update", item)
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteLedgerEntry(w http.ResponseWriter, r *http.Request, user authUser) {
	entryID, ok := pathID(w, r, "entryId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from ledger_entries where id = $1 and deleted_at is null", entryID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "update ledger_entries set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", entryID)
	a.recordDataChange(r.Context(), "ledger_entry", entryID, familyID, user.ID, "delete", map[string]any{"id": entryID})
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
		where family_id = $1 and schedule_date between $2 and $3 and deleted_at is null
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
	a.recordDataChange(r.Context(), "family_schedule", item.ID, familyID, user.ID, "create", item)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateSchedule(w http.ResponseWriter, r *http.Request, user authUser) {
	id, ok := pathID(w, r, "scheduleId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from family_schedules where id = $1 and deleted_at is null", id)
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
	a.recordDataChange(r.Context(), "family_schedule", item.ID, familyID, user.ID, "update", item)
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteSchedule(w http.ResponseWriter, r *http.Request, user authUser) {
	id, ok := pathID(w, r, "scheduleId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from family_schedules where id = $1 and deleted_at is null", id)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "update family_schedules set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", id)
	a.recordDataChange(r.Context(), "family_schedule", id, familyID, user.ID, "delete", map[string]any{"id": id})
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
		from trips where family_id = $1 and deleted_at is null order by created_at desc
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
	a.recordDataChange(r.Context(), "trip", item.ID, familyID, user.ID, "create", item)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateTrip(w http.ResponseWriter, r *http.Request, user authUser) {
	tripID, ok := pathID(w, r, "tripId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from trips where id = $1 and deleted_at is null", tripID)
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
	a.recordDataChange(r.Context(), "trip", item.ID, familyID, user.ID, "update", item)
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteTrip(w http.ResponseWriter, r *http.Request, user authUser) {
	tripID, ok := pathID(w, r, "tripId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from trips where id = $1 and deleted_at is null", tripID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "update travel_records set deleted_at = now(), updated_at = now() where trip_id = $1 and deleted_at is null", tripID)
	_, _ = a.db.Exec(r.Context(), "update trips set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", tripID)
	a.recordDataChange(r.Context(), "trip", tripID, familyID, user.ID, "delete", map[string]any{"id": tripID})
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) listTravelRecords(w http.ResponseWriter, r *http.Request, user authUser) {
	tripID, ok := pathID(w, r, "tripId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from trips where id = $1 and deleted_at is null", tripID)
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
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from trips where id = $1 and deleted_at is null", tripID)
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
	a.recordDataChange(r.Context(), "travel_record", item.ID, familyID, user.ID, "create", item)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateTravelRecord(w http.ResponseWriter, r *http.Request, user authUser) {
	recordID, ok := pathID(w, r, "recordId")
	if !ok {
		return
	}
	var tripID, familyID int64
	err := a.db.QueryRow(r.Context(), `
		select r.trip_id, t.family_id from travel_records r join trips t on t.id = r.trip_id where r.id = $1 and r.deleted_at is null and t.deleted_at is null
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
	a.recordDataChange(r.Context(), "travel_record", item.ID, familyID, user.ID, "update", item)
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteTravelRecord(w http.ResponseWriter, r *http.Request, user authUser) {
	recordID, ok := pathID(w, r, "recordId")
	if !ok {
		return
	}
	var tripID, familyID int64
	err := a.db.QueryRow(r.Context(), `
		select r.trip_id, t.family_id from travel_records r join trips t on t.id = r.trip_id where r.id = $1 and r.deleted_at is null and t.deleted_at is null
	`, recordID).Scan(&tripID, &familyID)
	if err != nil {
		writeError(w, http.StatusNotFound, "travel record not found")
		return
	}
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "update travel_records set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", recordID)
	a.recordDataChange(r.Context(), "travel_record", recordID, familyID, user.ID, "delete", map[string]any{"id": recordID, "tripId": tripID})
	_ = tripID
	w.WriteHeader(http.StatusNoContent)
}

type babyProfileItem struct {
	ID             int64    `json:"id"`
	FamilyID       int64    `json:"familyId"`
	Name           string   `json:"name"`
	Gender         *string  `json:"gender,omitempty"`
	BirthDate      string   `json:"birthDate"`
	Memo           *string  `json:"memo,omitempty"`
	PhotoURL       *string  `json:"photoUrl,omitempty"`
	LatestHeightCm *float64 `json:"latestHeightCm,omitempty"`
	LatestWeightKg *float64 `json:"latestWeightKg,omitempty"`
	CreatedAt      string   `json:"createdAt"`
}

type babyRecordItem struct {
	ID         int64    `json:"id"`
	BabyID     int64    `json:"babyId"`
	RecordType string   `json:"recordType"`
	RecordDate string   `json:"recordDate"`
	RecordTime *string  `json:"recordTime,omitempty"`
	AmountMl   *int     `json:"amountMl,omitempty"`
	HeightCm   *float64 `json:"heightCm,omitempty"`
	WeightKg   *float64 `json:"weightKg,omitempty"`
	Memo       *string  `json:"memo,omitempty"`
	MediaURLs  []string `json:"mediaUrls"`
	CreatedAt  string   `json:"createdAt"`
}

func (a *app) listBabies(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID := queryInt64(r, "familyId", 1)
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select id, family_id, name, gender, birth_date, memo, photo_url, latest_height_cm, latest_weight_kg, created_at
		from baby_profiles where family_id = $1 and deleted_at is null order by created_at desc
	`, familyID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items, ok := scanBabies(w, rows)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) createBaby(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID := queryInt64(r, "familyId", 1)
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	req, ok := readBabyPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveBaby(w, r, 0, familyID, req)
	if !ok {
		return
	}
	a.recordDataChange(r.Context(), "baby_profile", item.ID, familyID, user.ID, "create", item)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateBaby(w http.ResponseWriter, r *http.Request, user authUser) {
	babyID, ok := pathID(w, r, "babyId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from baby_profiles where id = $1 and deleted_at is null", babyID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "update") {
		return
	}
	req, ok := readBabyPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveBaby(w, r, babyID, familyID, req)
	if !ok {
		return
	}
	a.recordDataChange(r.Context(), "baby_profile", item.ID, familyID, user.ID, "update", item)
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteBaby(w http.ResponseWriter, r *http.Request, user authUser) {
	babyID, ok := pathID(w, r, "babyId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from baby_profiles where id = $1 and deleted_at is null", babyID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "update baby_records set deleted_at = now(), updated_at = now() where baby_id = $1 and deleted_at is null", babyID)
	_, _ = a.db.Exec(r.Context(), "update baby_profiles set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", babyID)
	a.recordDataChange(r.Context(), "baby_profile", babyID, familyID, user.ID, "delete", map[string]any{"id": babyID})
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) listBabyRecords(w http.ResponseWriter, r *http.Request, user authUser) {
	babyID, ok := pathID(w, r, "babyId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from baby_profiles where id = $1 and deleted_at is null", babyID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	start, end := r.URL.Query().Get("startDate"), r.URL.Query().Get("endDate")
	query := `
		select id, baby_id, record_type, record_date, record_time, amount_ml, height_cm, weight_kg, memo, created_at
		from baby_records where baby_id = $1 and deleted_at is null
	`
	args := []any{babyID}
	if validDate(start) && validDate(end) {
		query += " and record_date between $2 and $3"
		args = append(args, start, end)
	}
	query += " order by record_date desc, created_at desc"
	rows, err := a.db.Query(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items, ok := a.scanBabyRecords(w, r.Context(), rows)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) createBabyRecord(w http.ResponseWriter, r *http.Request, user authUser) {
	babyID, ok := pathID(w, r, "babyId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from baby_profiles where id = $1 and deleted_at is null", babyID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	req, ok := readBabyRecordPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveBabyRecord(w, r, 0, babyID, req)
	if !ok {
		return
	}
	a.recordDataChange(r.Context(), "baby_record", item.ID, familyID, user.ID, "create", item)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateBabyRecord(w http.ResponseWriter, r *http.Request, user authUser) {
	recordID, ok := pathID(w, r, "recordId")
	if !ok {
		return
	}
	var babyID, familyID int64
	err := a.db.QueryRow(r.Context(), `select r.baby_id, b.family_id from baby_records r join baby_profiles b on b.id = r.baby_id where r.id = $1 and r.deleted_at is null and b.deleted_at is null`, recordID).Scan(&babyID, &familyID)
	if err != nil {
		writeError(w, http.StatusNotFound, "baby record not found")
		return
	}
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "update") {
		return
	}
	req, ok := readBabyRecordPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveBabyRecord(w, r, recordID, babyID, req)
	if !ok {
		return
	}
	a.recordDataChange(r.Context(), "baby_record", item.ID, familyID, user.ID, "update", item)
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteBabyRecord(w http.ResponseWriter, r *http.Request, user authUser) {
	recordID, ok := pathID(w, r, "recordId")
	if !ok {
		return
	}
	var familyID int64
	err := a.db.QueryRow(r.Context(), `select b.family_id from baby_records r join baby_profiles b on b.id = r.baby_id where r.id = $1 and r.deleted_at is null and b.deleted_at is null`, recordID).Scan(&familyID)
	if err != nil {
		writeError(w, http.StatusNotFound, "baby record not found")
		return
	}
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "update baby_records set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", recordID)
	a.recordDataChange(r.Context(), "baby_record", recordID, familyID, user.ID, "delete", map[string]any{"id": recordID})
	w.WriteHeader(http.StatusNoContent)
}

type diaryItem struct {
	ID             int64    `json:"id"`
	FamilyID       int64    `json:"familyId"`
	Title          string   `json:"title"`
	Body           string   `json:"body"`
	DiaryDate      string   `json:"diaryDate"`
	Weather        *string  `json:"weather,omitempty"`
	Mood           *string  `json:"mood,omitempty"`
	MinTemperature *int     `json:"minTemperature,omitempty"`
	MaxTemperature *int     `json:"maxTemperature,omitempty"`
	MediaURLs      []string `json:"mediaUrls"`
	CreatedAt      string   `json:"createdAt"`
}

func (a *app) listDiaries(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, start, end, ok := familyDateRange(w, r)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select id, family_id, title, body, diary_date, weather, mood, min_temperature, max_temperature, created_at
		from family_diaries where family_id = $1 and diary_date between $2 and $3 and deleted_at is null
		order by diary_date desc, created_at desc
	`, familyID, start, end)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items, ok := a.scanDiaries(w, r.Context(), rows)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) createDiary(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID := queryInt64(r, "familyId", 1)
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	req, ok := readDiaryPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveDiary(w, r, 0, familyID, req)
	if !ok {
		return
	}
	a.recordDataChange(r.Context(), "family_diary", item.ID, familyID, user.ID, "create", item)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateDiary(w http.ResponseWriter, r *http.Request, user authUser) {
	diaryID, ok := pathID(w, r, "diaryId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from family_diaries where id = $1 and deleted_at is null", diaryID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "update") {
		return
	}
	req, ok := readDiaryPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveDiary(w, r, diaryID, familyID, req)
	if !ok {
		return
	}
	a.recordDataChange(r.Context(), "family_diary", item.ID, familyID, user.ID, "update", item)
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteDiary(w http.ResponseWriter, r *http.Request, user authUser) {
	diaryID, ok := pathID(w, r, "diaryId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from family_diaries where id = $1 and deleted_at is null", diaryID)
	if !ok || !a.requireFamilyPermission(w, r.Context(), user, familyID, "delete") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "update family_diaries set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", diaryID)
	a.recordDataChange(r.Context(), "family_diary", diaryID, familyID, user.ID, "delete", map[string]any{"id": diaryID})
	w.WriteHeader(http.StatusNoContent)
}

type communityPostItem struct {
	ID              int64    `json:"id"`
	BoardType       string   `json:"boardType"`
	FamilyID        *int64   `json:"familyId,omitempty"`
	AuthorID        *int64   `json:"authorId,omitempty"`
	AuthorName      string   `json:"authorName"`
	Title           string   `json:"title"`
	Body            string   `json:"body"`
	MediaURLs       []string `json:"mediaUrls"`
	ViewCount       int64    `json:"viewCount"`
	PeriodViewCount int64    `json:"periodViewCount,omitempty"`
	CreatedAt       string   `json:"createdAt"`
	UpdatedAt       string   `json:"updatedAt"`
}

type communityCommentItem struct {
	ID         int64  `json:"id"`
	PostID     int64  `json:"postId"`
	AuthorID   *int64 `json:"authorId,omitempty"`
	AuthorName string `json:"authorName"`
	Body       string `json:"body"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

func (a *app) listCommunityPosts(w http.ResponseWriter, r *http.Request, user authUser) {
	board, ok := normalizeBoard(w, r.URL.Query().Get("boardType"))
	if !ok || !a.requireBoardRead(w, user, board) {
		return
	}
	familyID := queryInt64(r, "familyId", 0)
	query := `select id, board_type, family_id, author_id, author_name, title, body::text, coalesce(view_count,0), created_at, updated_at from community_posts where board_type = $1 and deleted_at is null`
	args := []any{board}
	if familyID > 0 && board != "free" && board != "notice" {
		if !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
			return
		}
		query += " and family_id = $2"
		args = append(args, familyID)
	}
	query += " order by created_at desc"
	rows, err := a.db.Query(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items, ok := a.scanCommunityPosts(w, r.Context(), rows)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) getCommunityPost(w http.ResponseWriter, r *http.Request, user authUser) {
	postID, ok := pathID(w, r, "postId")
	if !ok {
		return
	}
	post, ok := a.communityPostByID(w, r.Context(), postID)
	if !ok || !a.requirePostRead(w, r.Context(), user, post) {
		return
	}
	a.recordCommunityPostView(r.Context(), postID)
	post, ok = a.communityPostByID(w, r.Context(), postID)
	if !ok {
		return
	}
	comments, ok := a.communityComments(w, r.Context(), postID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"post": post, "comments": comments})
}

func (a *app) listCommunityBestPosts(w http.ResponseWriter, r *http.Request, user authUser) {
	board, ok := normalizeBoard(w, r.URL.Query().Get("boardType"))
	if !ok || !a.requireBoardRead(w, user, board) {
		return
	}
	period := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("period")))
	var days int
	switch period {
	case "", "daily", "day":
		days = 1
	case "weekly", "week":
		days = 7
	case "monthly", "month":
		days = 30
	default:
		writeError(w, http.StatusBadRequest, "invalid period")
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select p.id, p.board_type, p.family_id, p.author_id, p.author_name, p.title, p.body::text,
		       coalesce(p.view_count,0), p.created_at, p.updated_at, coalesce(sum(v.view_count),0) as period_views
		from community_posts p
		left join community_post_view_stats v
		  on v.community_post_id = p.id
		 and v.view_date >= current_date - (($2::int - 1) * interval '1 day')
		where p.board_type = $1 and p.deleted_at is null
		group by p.id
		order by period_views desc, coalesce(p.view_count,0) desc, p.created_at desc
		limit 10
	`, board, days)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items := []communityPostItem{}
	for rows.Next() {
		var item communityPostItem
		var familyID, authorID sql.NullInt64
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&item.ID, &item.BoardType, &familyID, &authorID, &item.AuthorName, &item.Title, &item.Body, &item.ViewCount, &createdAt, &updatedAt, &item.PeriodViewCount); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return
		}
		item.FamilyID = nullInt64(familyID)
		item.AuthorID = nullInt64(authorID)
		item.MediaURLs = a.mediaURLs(r.Context(), "community_post_media_urls", "community_post_id", item.ID)
		item.CreatedAt = formatTime(createdAt)
		item.UpdatedAt = formatTime(updatedAt)
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) createCommunityPost(w http.ResponseWriter, r *http.Request, user authUser) {
	req, ok := readCommunityPostPayload(w, r)
	if !ok || !a.requireBoardWrite(w, user, req.BoardType) {
		return
	}
	if req.FamilyID != nil && !a.requireFamilyPermission(w, r.Context(), user, *req.FamilyID, "create") {
		return
	}
	item, ok := a.saveCommunityPost(w, r, 0, user, req)
	if !ok {
		return
	}
	var familyID int64
	if item.FamilyID != nil {
		familyID = *item.FamilyID
	}
	a.recordDataChange(r.Context(), "community_post", item.ID, familyID, user.ID, "create", item)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateCommunityPost(w http.ResponseWriter, r *http.Request, user authUser) {
	postID, ok := pathID(w, r, "postId")
	if !ok {
		return
	}
	old, ok := a.communityPostByID(w, r.Context(), postID)
	if !ok || !a.requirePostWrite(w, user, old) {
		return
	}
	req, ok := readCommunityPostPayload(w, r)
	if !ok || !a.requireBoardWrite(w, user, req.BoardType) {
		return
	}
	if req.FamilyID != nil && !a.requireFamilyPermission(w, r.Context(), user, *req.FamilyID, "update") {
		return
	}
	item, ok := a.saveCommunityPost(w, r, postID, user, req)
	if !ok {
		return
	}
	var familyID int64
	if item.FamilyID != nil {
		familyID = *item.FamilyID
	}
	a.recordDataChange(r.Context(), "community_post", item.ID, familyID, user.ID, "update", item)
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteCommunityPost(w http.ResponseWriter, r *http.Request, user authUser) {
	postID, ok := pathID(w, r, "postId")
	if !ok {
		return
	}
	post, ok := a.communityPostByID(w, r.Context(), postID)
	if !ok || !a.requirePostWrite(w, user, post) {
		return
	}
	_, _ = a.db.Exec(r.Context(), "update community_comments set deleted_at = now(), updated_at = now() where post_id = $1 and deleted_at is null", postID)
	_, _ = a.db.Exec(r.Context(), "update community_posts set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", postID)
	var familyID int64
	if post.FamilyID != nil {
		familyID = *post.FamilyID
	}
	a.recordDataChange(r.Context(), "community_post", postID, familyID, user.ID, "delete", map[string]any{"id": postID})
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) createCommunityComment(w http.ResponseWriter, r *http.Request, user authUser) {
	postID, ok := pathID(w, r, "postId")
	if !ok {
		return
	}
	post, ok := a.communityPostByID(w, r.Context(), postID)
	if !ok || !a.requirePostRead(w, r.Context(), user, post) {
		return
	}
	if (post.BoardType == "notice" || post.BoardType == "inquiry") && !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	var req struct {
		Body string `json:"body"`
	}
	if !readJSON(w, r, &req) || strings.TrimSpace(req.Body) == "" {
		writeError(w, http.StatusBadRequest, "body is required")
		return
	}
	var item communityCommentItem
	var authorID int64 = user.ID
	var createdAt, updatedAt time.Time
	err := a.db.QueryRow(r.Context(), `
		insert into community_comments (post_id, author_id, author_name, body, created_at, updated_at)
		values ($1,$2,$3,$4,now(),now())
		returning id, post_id, author_id, author_name, body::text, created_at, updated_at
	`, postID, user.ID, a.displayName(r.Context(), user), req.Body).
		Scan(&item.ID, &item.PostID, &authorID, &item.AuthorName, &item.Body, &createdAt, &updatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "comment save failed")
		return
	}
	item.AuthorID = &authorID
	item.CreatedAt = formatTime(createdAt)
	item.UpdatedAt = formatTime(updatedAt)
	var familyID int64
	if post.FamilyID != nil {
		familyID = *post.FamilyID
	}
	a.recordDataChange(r.Context(), "community_comment", item.ID, familyID, user.ID, "create", item)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateCommunityComment(w http.ResponseWriter, r *http.Request, user authUser) {
	commentID, ok := pathID(w, r, "commentId")
	if !ok {
		return
	}
	comment, ok := a.commentOwner(w, r.Context(), commentID)
	if !ok || (!user.PlatformAdmin && (comment.AuthorID == nil || *comment.AuthorID != user.ID)) {
		writeError(w, http.StatusForbidden, "only the author can change this content")
		return
	}
	var req struct {
		Body string `json:"body"`
	}
	if !readJSON(w, r, &req) || strings.TrimSpace(req.Body) == "" {
		writeError(w, http.StatusBadRequest, "body is required")
		return
	}
	var item communityCommentItem
	var authorID sql.NullInt64
	var createdAt, updatedAt time.Time
	err := a.db.QueryRow(r.Context(), `
		update community_comments set body=$1, updated_at=now() where id=$2 and deleted_at is null
		returning id, post_id, author_id, author_name, body::text, created_at, updated_at
	`, req.Body, commentID).Scan(&item.ID, &item.PostID, &authorID, &item.AuthorName, &item.Body, &createdAt, &updatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "comment save failed")
		return
	}
	item.AuthorID = nullInt64(authorID)
	item.CreatedAt = formatTime(createdAt)
	item.UpdatedAt = formatTime(updatedAt)
	a.recordDataChange(r.Context(), "community_comment", item.ID, 0, user.ID, "update", item)
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteCommunityComment(w http.ResponseWriter, r *http.Request, user authUser) {
	commentID, ok := pathID(w, r, "commentId")
	if !ok {
		return
	}
	comment, ok := a.commentOwner(w, r.Context(), commentID)
	if !ok || (!user.PlatformAdmin && (comment.AuthorID == nil || *comment.AuthorID != user.ID)) {
		writeError(w, http.StatusForbidden, "only the author can change this content")
		return
	}
	_, _ = a.db.Exec(r.Context(), "update community_comments set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", commentID)
	a.recordDataChange(r.Context(), "community_comment", commentID, 0, user.ID, "delete", map[string]any{"id": commentID})
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) uploadMedia(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID := queryInt64(r, "familyId", 0)
	if familyID > 0 && !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	if err := r.ParseMultipartForm(a.cfg.maxVideoBytes + 1024*1024); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	limit := int64(0)
	lowerType := strings.ToLower(contentType)
	if strings.HasPrefix(lowerType, "image/") {
		limit = a.cfg.maxImageBytes
	} else if strings.HasPrefix(lowerType, "video/") {
		limit = a.cfg.maxVideoBytes
	} else {
		writeError(w, http.StatusUnsupportedMediaType, "only image and video files are allowed")
		return
	}
	if header.Size > limit {
		writeError(w, http.StatusRequestEntityTooLarge, "file is too large")
		return
	}
	storedName := newSessionID() + safeExtension(header.Filename)
	written, err := a.mediaStore.Save(r.Context(), storedName, file, contentType, limit)
	if errors.Is(err, errMediaTooLarge) || written > limit {
		writeError(w, http.StatusRequestEntityTooLarge, "file is too large")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "file save failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"url":              a.cfg.mediaPublicPrefix + "/" + storedName,
		"storedFileName":   storedName,
		"originalFileName": header.Filename,
		"contentType":      contentType,
		"size":             written,
	})
}

func (a *app) downloadMedia(w http.ResponseWriter, r *http.Request) {
	fileName := r.PathValue("fileName")
	if fileName == "" {
		writeError(w, http.StatusBadRequest, "invalid file name")
		return
	}
	file, contentType, err := a.mediaStore.Open(r.Context(), fileName)
	if err != nil {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	defer file.Close()
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.Header().Set("Content-Disposition", "inline; filename=\""+strings.ReplaceAll(fileName, "\"", "")+"\"")
	_, _ = io.Copy(w, file)
}

type notificationItem struct {
	ID         int64   `json:"id"`
	UserID     int64   `json:"userId"`
	FamilyID   int64   `json:"familyId"`
	ScheduleID *int64  `json:"scheduleId,omitempty"`
	Type       string  `json:"type"`
	Title      string  `json:"title"`
	Body       string  `json:"body"`
	TargetDate string  `json:"targetDate"`
	ReadAt     *string `json:"readAt,omitempty"`
	CreatedAt  string  `json:"createdAt"`
}

func (a *app) listNotifications(w http.ResponseWriter, r *http.Request, user authUser) {
	unreadOnly := r.URL.Query().Get("unreadOnly") != "false"
	query := `select id, user_id, family_id, schedule_id, type, title, body, target_date, read_at, created_at from app_notifications where user_id = $1`
	if unreadOnly {
		query += " and read_at is null"
	}
	query += " order by created_at desc"
	rows, err := a.db.Query(r.Context(), query, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items, ok := scanNotifications(w, rows)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) createScheduleReminders(w http.ResponseWriter, r *http.Request, user authUser) {
	targetDate := r.URL.Query().Get("date")
	if targetDate == "" {
		targetDate = time.Now().Format("2006-01-02")
	}
	if !validDate(targetDate) {
		writeError(w, http.StatusBadRequest, "date is invalid")
		return
	}
	familyIDs := []int64{}
	rows, err := a.db.Query(r.Context(), `
		select distinct family_id from family_members where user_id = $1 and can_read = true
		union
		select id from family_groups where $2 = true
	`, user.ID, user.PlatformAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			familyIDs = append(familyIDs, id)
		}
	}
	rows.Close()
	created := 0
	for _, familyID := range familyIDs {
		schedules, err := a.db.Query(r.Context(), `
			select id, title, coalesce(schedule_time::text, ''), coalesce(category, '일정')
			from family_schedules where family_id = $1 and schedule_date = $2 and deleted_at is null
		`, familyID, targetDate)
		if err != nil {
			continue
		}
		for schedules.Next() {
			var scheduleID int64
			var title, scheduleTime, category string
			if schedules.Scan(&scheduleID, &title, &scheduleTime, &category) != nil {
				continue
			}
			memberRows, err := a.db.Query(r.Context(), "select user_id from family_members where family_id = $1 and can_read = true", familyID)
			if err != nil {
				continue
			}
			for memberRows.Next() {
				var userID int64
				if memberRows.Scan(&userID) != nil {
					continue
				}
				bodyTime := scheduleTime
				if bodyTime == "" {
					bodyTime = "시간 미정"
				}
				tag, err := a.db.Exec(r.Context(), `
					insert into app_notifications (user_id, family_id, schedule_id, type, title, body, target_date, created_at)
					values ($1,$2,$3,'SCHEDULE_REMINDER','등록된 일정이 있습니다.', $4, $5, now())
					on conflict (user_id, schedule_id, type, target_date) do nothing
				`, userID, familyID, scheduleID, bodyTime+" "+title+" · "+category, targetDate)
				if err == nil {
					created += int(tag.RowsAffected())
				}
			}
			memberRows.Close()
		}
		schedules.Close()
	}
	writeJSON(w, http.StatusOK, map[string]int{"created": created})
}

func (a *app) markNotificationRead(w http.ResponseWriter, r *http.Request, user authUser) {
	id, ok := pathID(w, r, "notificationId")
	if !ok {
		return
	}
	row := a.db.QueryRow(r.Context(), `
		update app_notifications set read_at = now() where id = $1 and user_id = $2
		returning id, user_id, family_id, schedule_id, type, title, body, target_date, read_at, created_at
	`, id, user.ID)
	item, ok := scanNotificationRow(w, row)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *app) markAllNotificationsRead(w http.ResponseWriter, r *http.Request, user authUser) {
	_, _ = a.db.Exec(r.Context(), "update app_notifications set read_at = now() where user_id = $1 and read_at is null", user.ID)
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

func (a *app) oauthRedirectURL(provider string) string {
	return a.cfg.publicBaseURL + "/api/auth/oauth/" + provider + "/callback"
}

func (a *app) consumeOAuthState(ctx context.Context, provider, state string) bool {
	tag, err := a.db.Exec(ctx, `
		delete from oauth_login_states
		where state = $1 and provider = $2 and expires_at > now()
	`, state, provider)
	return err == nil && tag.RowsAffected() == 1
}

func (a *app) exchangeOAuthCode(ctx context.Context, providerName string, provider oauthProviderConfig, code string) (string, error) {
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("client_id", provider.clientID)
	if strings.TrimSpace(provider.clientSecret) != "" {
		form.Set("client_secret", provider.clientSecret)
	}
	form.Set("code", code)
	form.Set("redirect_uri", a.oauthRedirectURL(providerName))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, provider.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return "", fmt.Errorf("oauth token endpoint returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var tokenResponse struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResponse); err != nil {
		return "", err
	}
	if tokenResponse.AccessToken == "" {
		return "", fmt.Errorf("oauth access token is empty")
	}
	return tokenResponse.AccessToken, nil
}

func (a *app) fetchOAuthProfile(ctx context.Context, providerName string, provider oauthProviderConfig, accessToken string) (oauthProfile, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, provider.userInfoURL, nil)
	if err != nil {
		return oauthProfile{}, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return oauthProfile{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return oauthProfile{}, fmt.Errorf("oauth userinfo endpoint returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var raw map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return oauthProfile{}, err
	}
	switch providerName {
	case "google":
		return oauthProfile{
			ProviderUserID: stringFromAny(raw["sub"]),
			Email:          normalizeEmail(stringFromAny(raw["email"])),
			Nickname:       firstNonEmpty(stringFromAny(raw["name"]), stringFromAny(raw["email"]), "Google User"),
		}, nil
	case "naver":
		response, _ := raw["response"].(map[string]any)
		return oauthProfile{
			ProviderUserID: stringFromAny(response["id"]),
			Email:          normalizeEmail(stringFromAny(response["email"])),
			Nickname:       firstNonEmpty(stringFromAny(response["nickname"]), stringFromAny(response["name"]), stringFromAny(response["email"]), "Naver User"),
		}, nil
	case "kakao":
		account, _ := raw["kakao_account"].(map[string]any)
		profile, _ := account["profile"].(map[string]any)
		return oauthProfile{
			ProviderUserID: stringFromAny(raw["id"]),
			Email:          normalizeEmail(stringFromAny(account["email"])),
			Nickname:       firstNonEmpty(stringFromAny(profile["nickname"]), stringFromAny(account["email"]), "Kakao User"),
		}, nil
	default:
		return oauthProfile{}, fmt.Errorf("oauth provider not supported")
	}
}

func (a *app) loginOAuthUser(ctx context.Context, provider string, profile oauthProfile, forceLogin bool) (authResponse, error) {
	email := profile.Email
	nickname := strings.TrimSpace(profile.Nickname)
	if nickname == "" {
		nickname = provider + " user"
	}

	tx, err := a.db.Begin(ctx)
	if err != nil {
		return authResponse{}, err
	}
	defer tx.Rollback(ctx)

	var userID int64
	var currentEmail, currentNickname string
	var platformAdmin bool
	var activeSessionID sql.NullString
	err = tx.QueryRow(ctx, `
		select u.id, u.email, u.nickname, u.platform_admin, u.active_session_id
		from oauth_identities oi
		join app_users u on u.id = oi.user_id
		where oi.provider = $1 and oi.provider_user_id = $2
	`, provider, profile.ProviderUserID).Scan(&userID, &currentEmail, &currentNickname, &platformAdmin, &activeSessionID)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `
			select id, email, nickname, platform_admin, active_session_id
			from app_users
			where provider = $1 and provider_user_id = $2
		`, provider, profile.ProviderUserID).Scan(&userID, &currentEmail, &currentNickname, &platformAdmin, &activeSessionID)
		if err == nil {
			if err := a.linkOAuthIdentity(ctx, tx, provider, profile.ProviderUserID, userID); err != nil {
				return authResponse{}, err
			}
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		if email == "" {
			return authResponse{}, errOAuthEmailRequired
		}
		created, err := a.findOrCreateOAuthUser(ctx, tx, provider, profile.ProviderUserID, email, nickname, &userID, &currentEmail, &currentNickname, &platformAdmin, &activeSessionID)
		if err != nil {
			return authResponse{}, err
		}
		if created {
			a.log.Info("oauth user created without automatic family assignment", "provider", provider, "userId", userID)
		}
	} else if err != nil {
		return authResponse{}, err
	}
	if email != "" && !strings.EqualFold(currentEmail, email) {
		if err := a.reconcileOAuthEmail(ctx, tx, provider, profile.ProviderUserID, email, nickname, &userID, &currentEmail, &currentNickname, &platformAdmin, &activeSessionID); err != nil {
			return authResponse{}, err
		}
	}

	if activeSessionID.Valid && activeSessionID.String != "" && !forceLogin {
		return authResponse{}, errActiveSessionExists
	}
	sessionID := newSessionID()
	_, err = tx.Exec(ctx, `
		update app_users
		set active_session_id = $1, failed_login_attempts = 0, locked_until = null
		where id = $2
	`, sessionID, userID)
	if err != nil {
		return authResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return authResponse{}, err
	}

	user := authUser{ID: userID, Email: currentEmail, PlatformAdmin: platformAdmin, SessionID: sessionID}
	return authResponse{
		AccessToken:   a.issueToken(user),
		UserID:        userID,
		Email:         currentEmail,
		Nickname:      currentNickname,
		PlatformAdmin: platformAdmin,
	}, nil
}

func (a *app) findOrCreateOAuthUser(ctx context.Context, tx pgx.Tx, provider, providerUserID, email, nickname string, userID *int64, currentEmail *string, currentNickname *string, platformAdmin *bool, activeSessionID *sql.NullString) (bool, error) {
	if email != "" {
		err := tx.QueryRow(ctx, `
			update app_users
			set provider = coalesce(provider, $1),
			    provider_user_id = coalesce(provider_user_id, $2),
			    email_verified_at = coalesce(email_verified_at, now()),
			    email_verification_required = false
			where email = $3
			returning id, email, nickname, platform_admin, active_session_id
		`, provider, providerUserID, email).Scan(userID, currentEmail, currentNickname, platformAdmin, activeSessionID)
		if err == nil {
			if err := a.linkOAuthIdentity(ctx, tx, provider, providerUserID, *userID); err != nil {
				return false, err
			}
			return false, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return false, err
		}
	}

	var userCount int64
	if err := tx.QueryRow(ctx, "select count(*) from app_users").Scan(&userCount); err != nil {
		return false, err
	}
	err := tx.QueryRow(ctx, `
		insert into app_users (created_at, email, nickname, platform_admin, provider, provider_user_id, active_session_id, failed_login_attempts, email_verified_at, email_verification_required)
		values (now(), $1, $2, $3, $4, $5, '', 0, now(), false)
		returning id, email, nickname, platform_admin, active_session_id
	`, email, nickname, userCount == 0, provider, providerUserID).Scan(userID, currentEmail, currentNickname, platformAdmin, activeSessionID)
	if err != nil {
		return false, err
	}
	if err := a.linkOAuthIdentity(ctx, tx, provider, providerUserID, *userID); err != nil {
		return false, err
	}
	return true, nil
}

func (a *app) reconcileOAuthEmail(ctx context.Context, tx pgx.Tx, provider, providerUserID, email, nickname string, userID *int64, currentEmail *string, currentNickname *string, platformAdmin *bool, activeSessionID *sql.NullString) error {
	err := tx.QueryRow(ctx, `
		update app_users
		set provider = coalesce(provider, $1),
		    provider_user_id = coalesce(provider_user_id, $2),
		    email_verified_at = coalesce(email_verified_at, now()),
		    email_verification_required = false
		where email = $3
		returning id, email, nickname, platform_admin, active_session_id
	`, provider, providerUserID, email).Scan(userID, currentEmail, currentNickname, platformAdmin, activeSessionID)
	if err == nil {
		return a.linkOAuthIdentity(ctx, tx, provider, providerUserID, *userID)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if strings.TrimSpace(nickname) == "" {
		nickname = *currentNickname
	}
	return tx.QueryRow(ctx, `
		update app_users
		set email = $1,
		    nickname = coalesce(nullif(nickname, ''), $2),
		    email_verified_at = coalesce(email_verified_at, now()),
		    email_verification_required = false
		where id = $3
		returning id, email, nickname, platform_admin, active_session_id
	`, email, nickname, *userID).Scan(userID, currentEmail, currentNickname, platformAdmin, activeSessionID)
}

func (a *app) linkOAuthIdentity(ctx context.Context, tx pgx.Tx, provider, providerUserID string, userID int64) error {
	_, err := tx.Exec(ctx, `
		insert into oauth_identities (provider, provider_user_id, user_id, created_at)
		values ($1, $2, $3, now())
		on conflict (provider, provider_user_id) do update set user_id = excluded.user_id
	`, provider, providerUserID, userID)
	return err
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
  login_id varchar(64),
  nickname varchar(255),
  platform_admin boolean not null default false,
  provider varchar(255),
  provider_user_id varchar(255),
  password_hash varchar(255),
  active_session_id varchar(255),
  locked_until timestamp with time zone,
  failed_login_attempts integer default 0,
  email_verified_at timestamp with time zone,
  email_verification_required boolean not null default false
);
alter table if exists app_users add column if not exists provider varchar(255);
alter table if exists app_users add column if not exists provider_user_id varchar(255);
alter table if exists app_users add column if not exists login_id varchar(64);
alter table if exists app_users add column if not exists email_verified_at timestamp with time zone;
alter table if exists app_users add column if not exists email_verification_required boolean not null default false;
create unique index if not exists idx_app_users_email_lower on app_users (lower(email)) where email is not null;
create unique index if not exists idx_app_users_login_id_lower on app_users (lower(login_id)) where login_id is not null;
create unique index if not exists idx_app_users_provider_subject on app_users (provider, provider_user_id) where provider is not null and provider_user_id is not null;
create table if not exists login_histories (
  id bigint generated by default as identity primary key,
  user_id bigint references app_users(id) on delete set null,
  email varchar(255),
  provider varchar(255) not null,
  event_type varchar(255) not null,
  result varchar(255) not null,
  reason varchar(512),
  created_at timestamp with time zone not null
);
create index if not exists idx_login_histories_user_created on login_histories (user_id, created_at desc);
create index if not exists idx_login_histories_email_created on login_histories (email, created_at desc);
create table if not exists oauth_identities (
  provider varchar(255) not null,
  provider_user_id varchar(255) not null,
  user_id bigint not null references app_users(id) on delete cascade,
  created_at timestamp with time zone not null,
  primary key (provider, provider_user_id)
);
create index if not exists idx_oauth_identities_user on oauth_identities (user_id);
create table if not exists email_verification_tokens (
  id bigint generated by default as identity primary key,
  user_id bigint not null references app_users(id) on delete cascade,
  token_hash varchar(255) not null unique,
  created_at timestamp with time zone not null,
  expires_at timestamp with time zone not null,
  used_at timestamp with time zone
);
create index if not exists idx_email_verification_tokens_user on email_verification_tokens (user_id, created_at desc);
create index if not exists idx_email_verification_tokens_expires on email_verification_tokens (expires_at);
create table if not exists password_reset_tokens (
  id bigint generated by default as identity primary key,
  user_id bigint not null references app_users(id) on delete cascade,
  token_hash varchar(255) not null unique,
  created_at timestamp with time zone not null,
  expires_at timestamp with time zone not null,
  used_at timestamp with time zone
);
create index if not exists idx_password_reset_tokens_user on password_reset_tokens (user_id, created_at desc);
create index if not exists idx_password_reset_tokens_expires on password_reset_tokens (expires_at);
create table if not exists account_recovery_inquiries (
  id bigint generated by default as identity primary key,
  created_at timestamp with time zone not null,
  email varchar(255),
  nickname varchar(255),
  contact varchar(255),
  recovery_type varchar(255),
  message text,
  status varchar(64) not null default 'OPEN'
);
create index if not exists idx_account_recovery_inquiries_created on account_recovery_inquiries (created_at desc);
create index if not exists idx_account_recovery_inquiries_status on account_recovery_inquiries (status, created_at desc);
create table if not exists email_send_attempts (
  id bigint generated by default as identity primary key,
  created_at timestamp with time zone not null,
  identifier varchar(255) not null,
  ip_address varchar(255),
  purpose varchar(255) not null
);
create index if not exists idx_email_send_attempts_identifier on email_send_attempts (purpose, identifier, created_at desc);
create table if not exists oauth_login_states (
  state varchar(255) primary key,
  provider varchar(255) not null,
  nonce varchar(255) not null,
  created_at timestamp with time zone not null,
  expires_at timestamp with time zone not null
);
create index if not exists idx_oauth_login_states_expires on oauth_login_states (expires_at);
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
create table if not exists family_invitations (
  id bigint generated by default as identity primary key,
  family_id bigint not null,
  inviter_user_id bigint not null,
  invitee_user_id bigint not null,
  role varchar(255) not null default 'MEMBER',
  can_read boolean not null default true,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  status varchar(64) not null default 'PENDING',
  created_at timestamp with time zone not null,
  responded_at timestamp with time zone
);
create index if not exists idx_family_invitations_invitee on family_invitations (invitee_user_id, status, created_at desc);
create index if not exists idx_family_invitations_family on family_invitations (family_id, status, created_at desc);
create table if not exists family_schedules (
  id bigint generated by default as identity primary key,
  calendar_basis varchar(255),
  category varchar(255),
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  family_id bigint,
  member_name varchar(255),
  memo varchar(255),
  repeat_rule varchar(255),
  schedule_date date,
  schedule_time time without time zone,
  title varchar(255)
);
alter table if exists family_schedules add column if not exists updated_at timestamp with time zone;
alter table if exists family_schedules add column if not exists deleted_at timestamp with time zone;
create table if not exists ledger_entries (
  id bigint generated by default as identity primary key,
  amount numeric(38,2),
  category varchar(255),
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  entry_type varchar(255),
  family_id bigint,
  member_name varchar(255),
  memo varchar(255),
  payment_method varchar(255),
  title varchar(255),
  transaction_date date
);
alter table if exists ledger_entries add column if not exists updated_at timestamp with time zone;
alter table if exists ledger_entries add column if not exists deleted_at timestamp with time zone;
create table if not exists trips (
  id bigint generated by default as identity primary key,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  description varchar(255),
  end_date date,
  family_id bigint,
  start_date date,
  title varchar(255)
);
alter table if exists trips add column if not exists updated_at timestamp with time zone;
alter table if exists trips add column if not exists deleted_at timestamp with time zone;
create table if not exists travel_records (
  id bigint generated by default as identity primary key,
  amount numeric(38,2),
  category varchar(255),
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
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
alter table if exists travel_records add column if not exists updated_at timestamp with time zone;
alter table if exists travel_records add column if not exists deleted_at timestamp with time zone;
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
create table if not exists baby_profiles (
  id bigint generated by default as identity primary key,
  birth_date date,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  family_id bigint,
  gender varchar(255),
  latest_height_cm numeric(38,2),
  latest_weight_kg numeric(38,2),
  memo varchar(255),
  name varchar(255),
  photo_url varchar(2048)
);
alter table if exists baby_profiles add column if not exists updated_at timestamp with time zone;
alter table if exists baby_profiles add column if not exists deleted_at timestamp with time zone;
create table if not exists baby_records (
  id bigint generated by default as identity primary key,
  amount_ml integer,
  baby_id bigint,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  height_cm numeric(38,2),
  memo varchar(255),
  record_date date,
  record_time varchar(255),
  record_type varchar(255),
  weight_kg numeric(38,2)
);
alter table if exists baby_records add column if not exists updated_at timestamp with time zone;
alter table if exists baby_records add column if not exists deleted_at timestamp with time zone;
create table if not exists baby_record_media_urls (
  baby_record_id bigint not null,
  media_urls varchar(2048)
);
create table if not exists family_diaries (
  id bigint generated by default as identity primary key,
  body text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  diary_date date,
  family_id bigint,
  max_temperature integer,
  min_temperature integer,
  mood varchar(255),
  title varchar(255),
  weather varchar(255)
);
alter table if exists family_diaries add column if not exists updated_at timestamp with time zone;
alter table if exists family_diaries add column if not exists deleted_at timestamp with time zone;
create table if not exists family_diary_media_urls (
  family_diary_id bigint not null,
  media_urls varchar(2048)
);
create table if not exists community_posts (
  id bigint generated by default as identity primary key,
  author_id bigint,
  author_name varchar(255),
  board_type varchar(255),
  body text,
  created_at timestamp with time zone,
  family_id bigint,
  title varchar(255),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  view_count bigint not null default 0
);
alter table community_posts add column if not exists view_count bigint not null default 0;
alter table if exists community_posts add column if not exists deleted_at timestamp with time zone;
create table if not exists community_post_media_urls (
  community_post_id bigint not null,
  media_urls varchar(2048)
);
create table if not exists community_post_view_stats (
  community_post_id bigint not null,
  view_date date not null,
  view_count bigint not null default 0,
  primary key (community_post_id, view_date)
);
create table if not exists community_comments (
  id bigint generated by default as identity primary key,
  author_id bigint,
  author_name varchar(255),
  body text,
  created_at timestamp with time zone,
  post_id bigint,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);
alter table if exists community_comments add column if not exists deleted_at timestamp with time zone;
create table if not exists data_change_histories (
  id bigint generated by default as identity primary key,
  entity_type varchar(255) not null,
  entity_id bigint not null,
  family_id bigint,
  actor_user_id bigint,
  action varchar(64) not null,
  created_at timestamp with time zone not null,
  snapshot jsonb
);
create index if not exists idx_data_change_histories_entity on data_change_histories (entity_type, entity_id, created_at desc);
create index if not exists idx_data_change_histories_family on data_change_histories (family_id, created_at desc);
create table if not exists app_notifications (
  id bigint generated by default as identity primary key,
  body varchar(255),
  created_at timestamp with time zone,
  family_id bigint,
  read_at timestamp with time zone,
  schedule_id bigint,
  target_date date,
  title varchar(255),
  type varchar(255),
  user_id bigint,
  constraint uk_app_notifications_schedule_user unique (user_id, schedule_id, type, target_date)
);
create index if not exists idx_family_schedules_family_date on family_schedules (family_id, schedule_date);
create index if not exists idx_ledger_entries_family_date on ledger_entries (family_id, transaction_date);
create index if not exists idx_trips_family on trips (family_id);
create index if not exists idx_travel_records_trip_order on travel_records (trip_id, sort_order);
create index if not exists idx_common_code_groups_family_menu on common_code_groups (family_id, menu_key);
create index if not exists idx_common_codes_group_order on common_codes (group_id, sort_order);
create index if not exists idx_baby_profiles_family on baby_profiles (family_id);
create index if not exists idx_baby_records_baby_date on baby_records (baby_id, record_date);
create index if not exists idx_family_diaries_family_date on family_diaries (family_id, diary_date);
create index if not exists idx_community_posts_board_created on community_posts (board_type, created_at);
create index if not exists idx_community_posts_board_views on community_posts (board_type, view_count);
create index if not exists idx_community_post_view_stats_date on community_post_view_stats (view_date, view_count);
create index if not exists idx_community_comments_post_created on community_comments (post_id, created_at);
create index if not exists idx_app_notifications_user_created on app_notifications (user_id, created_at);
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

func (a *app) recordLoginHistory(ctx context.Context, userID *int64, email, provider, eventType, result, reason string) {
	var userValue any
	if userID != nil {
		userValue = *userID
	}
	_, _ = a.db.Exec(ctx, `
		insert into login_histories (user_id, email, provider, event_type, result, reason, created_at)
		values ($1, $2, $3, $4, $5, $6, now())
	`, userValue, normalizeEmail(email), provider, eventType, result, reason)
}

func (a *app) recordDataChange(ctx context.Context, entityType string, entityID int64, familyID int64, userID int64, action string, snapshot any) {
	var snapshotJSON []byte
	if snapshot != nil {
		snapshotJSON, _ = json.Marshal(snapshot)
	}
	_, _ = a.db.Exec(ctx, `
		insert into data_change_histories (entity_type, entity_id, family_id, actor_user_id, action, created_at, snapshot)
		values ($1, $2, $3, $4, $5, now(), $6)
	`, entityType, entityID, familyID, userID, action, snapshotJSON)
}

func (a *app) reserveMailAttempt(ctx context.Context, identifier, ipAddress, purpose string) (bool, error) {
	limit := a.cfg.mailDailyLimit
	if limit <= 0 {
		return true, nil
	}
	identifier = strings.ToLower(strings.TrimSpace(identifier))
	if identifier == "" {
		identifier = "ip:" + strings.TrimSpace(ipAddress)
	}
	if identifier == "ip:" {
		identifier = "unknown"
	}
	var id int64
	err := a.db.QueryRow(ctx, `
		with recent as (
			select count(*) as count
			from email_send_attempts
			where purpose = $1
			  and identifier = $2
			  and created_at >= date_trunc('day', now())
		)
		insert into email_send_attempts (created_at, identifier, ip_address, purpose)
		select now(), $2, $3, $1
		where (select count from recent) < $4
		returning id
	`, purpose, identifier, strings.TrimSpace(ipAddress), limit).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func clientIP(r *http.Request) string {
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if ip := strings.TrimSpace(parts[0]); ip != "" {
			return ip
		}
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		return realIP
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func verificationTokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (a *app) createAndSendEmailVerification(ctx context.Context, userID int64, email, nickname string) error {
	token := newSessionID()
	tokenHash := verificationTokenHash(token)
	_, err := a.db.Exec(ctx, `
		insert into email_verification_tokens (user_id, token_hash, created_at, expires_at)
		values ($1, $2, now(), now() + interval '24 hours')
	`, userID, tokenHash)
	if err != nil {
		return err
	}
	verifyURL := strings.TrimRight(a.cfg.publicBaseURL, "/") + "/api/auth/verify-email?token=" + url.QueryEscape(token)
	return a.sendVerificationEmail(email, nickname, verifyURL)
}

func (a *app) createAndSendPasswordReset(ctx context.Context, userID int64, email, nickname string) error {
	token := newSessionID()
	tokenHash := verificationTokenHash(token)
	_, err := a.db.Exec(ctx, `
		insert into password_reset_tokens (user_id, token_hash, created_at, expires_at)
		values ($1, $2, now(), now() + interval '30 minutes')
	`, userID, tokenHash)
	if err != nil {
		return err
	}
	resetURL := strings.TrimRight(a.cfg.publicBaseURL, "/") + "/?resetToken=" + url.QueryEscape(token)
	return a.sendPasswordResetEmail(email, nickname, resetURL)
}

func (a *app) sendVerificationEmail(email, nickname, verifyURL string) error {
	if !a.mailConfigured() {
		return fmt.Errorf("mail delivery is not configured")
	}
	from := a.mailFromEmail()
	subject := "Family Platform 이메일 인증"
	displayName := strings.TrimSpace(nickname)
	if displayName == "" {
		displayName = "회원"
	}
	body := fmt.Sprintf("%s님, 아래 링크를 눌러 이메일 인증을 완료해주세요.\n\n%s\n\n이 링크는 24시간 동안 사용할 수 있습니다.", displayName, verifyURL)
	message := strings.Join([]string{
		"From: " + from,
		"To: " + email,
		"Subject: " + mimeHeader(subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")
	return a.sendMail(from, []string{email}, subject, body, []byte(message))
}

func (a *app) sendPasswordResetEmail(email, nickname, resetURL string) error {
	if !a.mailConfigured() {
		return fmt.Errorf("mail delivery is not configured")
	}
	from := a.mailFromEmail()
	subject := "Family Platform password reset"
	displayName := strings.TrimSpace(nickname)
	if displayName == "" {
		displayName = "member"
	}
	body := fmt.Sprintf("%s, use the link below to reset your password.\n\n%s\n\nThis link is valid for 30 minutes. If you did not request this, ignore this email.", displayName, resetURL)
	message := strings.Join([]string{
		"From: " + from,
		"To: " + email,
		"Subject: " + mimeHeader(subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")
	return a.sendMail(from, []string{email}, subject, body, []byte(message))
}

func (a *app) sendRecoveryInquiryEmail(id int64, email, nickname, contact, recoveryType, inquiryMessage string) error {
	if !a.mailConfigured() {
		return fmt.Errorf("mail delivery is not configured")
	}
	from := a.mailFromEmail()
	subject := fmt.Sprintf("Family Platform account recovery inquiry #%d", id)
	body := strings.Join([]string{
		fmt.Sprintf("Inquiry ID: %d", id),
		"Type: " + firstNonEmpty(recoveryType, "account recovery"),
		"Email: " + firstNonEmpty(email, "-"),
		"Nickname: " + firstNonEmpty(nickname, "-"),
		"Contact: " + firstNonEmpty(contact, "-"),
		"",
		firstNonEmpty(inquiryMessage, "-"),
	}, "\n")
	message := strings.Join([]string{
		"From: " + from,
		"To: " + from,
		"Subject: " + mimeHeader(subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")
	return a.sendMail(from, []string{from}, subject, body, []byte(message))
}

func (a *app) mailConfigured() bool {
	return (strings.TrimSpace(a.cfg.brevoAPIKey) != "" && strings.TrimSpace(a.cfg.mailFromEmail) != "") ||
		(strings.TrimSpace(a.cfg.smtpHost) != "" && strings.TrimSpace(a.cfg.smtpFrom) != "")
}

func (a *app) mailFromEmail() string {
	if strings.TrimSpace(a.cfg.mailFromEmail) != "" {
		return strings.TrimSpace(a.cfg.mailFromEmail)
	}
	return strings.TrimSpace(a.cfg.smtpFrom)
}

func (a *app) sendMail(from string, recipients []string, subject, textBody string, message []byte) error {
	if strings.TrimSpace(a.cfg.brevoAPIKey) != "" && strings.TrimSpace(a.cfg.mailFromEmail) != "" {
		return a.sendBrevoMail(recipients, subject, textBody)
	}
	return a.sendSMTPMail(from, recipients, message)
}

func (a *app) sendBrevoMail(recipients []string, subject, textBody string) error {
	type brevoAddress struct {
		Email string `json:"email"`
		Name  string `json:"name,omitempty"`
	}
	payload := struct {
		Sender      brevoAddress   `json:"sender"`
		To          []brevoAddress `json:"to"`
		Subject     string         `json:"subject"`
		TextContent string         `json:"textContent"`
		HTMLContent string         `json:"htmlContent,omitempty"`
	}{
		Sender: brevoAddress{
			Email: strings.TrimSpace(a.cfg.mailFromEmail),
			Name:  strings.TrimSpace(a.cfg.mailFromName),
		},
		Subject:     subject,
		TextContent: textBody,
		HTMLContent: "<pre style=\"font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:pre-wrap;line-height:1.5\">" + htmlEscape(textBody) + "</pre>",
	}
	for _, recipient := range recipients {
		if email := normalizeEmail(recipient); email != "" {
			payload.To = append(payload.To, brevoAddress{Email: email})
		}
	}
	if len(payload.To) == 0 {
		return fmt.Errorf("mail recipient is empty")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.brevo.com/v3/smtp/email", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("api-key", strings.TrimSpace(a.cfg.brevoAPIKey))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("brevo email failed with %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
	}
	return nil
}

func (a *app) sendSMTPMail(from string, recipients []string, message []byte) error {
	host := strings.TrimSpace(a.cfg.smtpHost)
	port := strings.TrimSpace(a.cfg.smtpPort)
	if port == "" {
		port = "587"
	}
	addr := net.JoinHostPort(host, port)
	timeout := 10 * time.Second
	dialer := &net.Dialer{Timeout: timeout}
	var conn net.Conn
	var err error
	if port == "465" {
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12})
	} else {
		conn, err = dialer.Dial("tcp", addr)
	}
	if err != nil {
		return err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(timeout))

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer client.Close()

	if port != "465" {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
				return err
			}
		}
	}
	if strings.TrimSpace(a.cfg.smtpUsername) != "" || strings.TrimSpace(a.cfg.smtpPassword) != "" {
		if ok, _ := client.Extension("AUTH"); ok {
			auth := smtp.PlainAuth("", a.cfg.smtpUsername, a.cfg.smtpPassword, host)
			if err := client.Auth(auth); err != nil {
				return err
			}
		}
	}
	if err := client.Mail(from); err != nil {
		return err
	}
	for _, recipient := range recipients {
		if err := client.Rcpt(recipient); err != nil {
			return err
		}
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write(message); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}

func maskEmail(email string) string {
	email = normalizeEmail(email)
	parts := strings.Split(email, "@")
	if len(parts) != 2 || parts[0] == "" {
		return email
	}
	local := []rune(parts[0])
	if len(local) <= 2 {
		return string(local[0]) + "***@" + parts[1]
	}
	return string(local[0]) + "***" + string(local[len(local)-1]) + "@" + parts[1]
}

func mimeHeader(value string) string {
	return "=?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte(value)) + "?="
}

func htmlEscape(value string) string {
	return strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&#39;",
	).Replace(value)
}

func writeEmailVerificationHTML(w http.ResponseWriter, status int, publicBaseURL string, success bool, message string) {
	redirectURL := strings.TrimRight(publicBaseURL, "/") + "/"
	title := "이메일 인증"
	if success {
		title = "인증 완료"
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, _ = fmt.Fprintf(w, `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>%s</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f3f6fb; color: #191f28; }
    main { width: min(420px, calc(100vw - 40px)); padding: 28px; border-radius: 24px; background: #fff; box-shadow: 0 18px 50px rgba(25, 31, 40, .12); text-align: center; }
    h1 { margin: 0 0 10px; font-size: 24px; }
    p { margin: 0 0 20px; color: #6b7684; line-height: 1.55; }
    a { display: inline-flex; min-height: 48px; align-items: center; justify-content: center; padding: 0 22px; border-radius: 14px; background: #3182f6; color: #fff; font-weight: 800; text-decoration: none; }
  </style>
</head>
<body>
  <main>
    <h1>%s</h1>
    <p>%s</p>
    <a href="%s">로그인 화면으로 이동</a>
  </main>
</body>
</html>`, title, title, message, redirectURL)
}

func writeOAuthCallbackHTML(w http.ResponseWriter, status int, publicBaseURL string, accessToken string, userPayload map[string]any, errorMessage string) {
	redirectURL := strings.TrimRight(publicBaseURL, "/") + "/"
	tokenJSON, _ := json.Marshal(accessToken)
	userJSON, _ := json.Marshal(userPayload)
	errorJSON, _ := json.Marshal(errorMessage)
	redirectJSON, _ := json.Marshal(redirectURL)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, _ = fmt.Fprintf(w, `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SSO Login</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f3f6fb; color: #191f28; }
    main { width: min(420px, calc(100vw - 40px)); padding: 28px; border-radius: 24px; background: #fff; box-shadow: 0 18px 50px rgba(25, 31, 40, .12); text-align: center; }
    h1 { margin: 0 0 10px; font-size: 24px; }
    p { margin: 0; color: #6b7684; line-height: 1.55; }
  </style>
</head>
<body>
  <main>
    <h1 id="title">SSO login is being processed</h1>
    <p id="message">Please wait a moment.</p>
  </main>
  <script>
    (function () {
      var token = %s;
      var user = %s;
      var error = %s;
      var redirect = %s;
      if (error) {
        document.getElementById('title').textContent = 'SSO login needs attention';
        document.getElementById('message').textContent = error === 'active session exists'
          ? 'There is already an active session. Please use email login once to replace the existing session.'
          : (error === 'oauth email consent required'
            ? 'Email consent is required to prevent duplicate accounts.'
            : 'A problem occurred while processing SSO login.');
        window.setTimeout(function () { window.location.replace(redirect); }, 1800);
        return;
      }
      if (!token || !user) {
        document.getElementById('title').textContent = 'SSO login failed';
        document.getElementById('message').textContent = 'Login data was not received. Please try again.';
        window.setTimeout(function () { window.location.replace(redirect); }, 1800);
        return;
      }
      localStorage.setItem('family-platform-access-token', token);
      localStorage.setItem('family-platform-user', JSON.stringify(user));
      localStorage.setItem('family-platform-sso-complete', String(Date.now()));
      document.getElementById('title').textContent = 'Login completed';
      document.getElementById('message').textContent = 'Opening Family Platform.';
      window.setTimeout(function () { window.location.replace(redirect); }, 350);
    }());
  </script>
</body>
</html>`, tokenJSON, userJSON, errorJSON, redirectJSON)
}

func redirectOAuthSuccess(w http.ResponseWriter, r *http.Request, publicBaseURL string, accessToken string, userPayload map[string]any) {
	redirectURL := strings.TrimRight(publicBaseURL, "/") + "/"
	userJSON, _ := json.Marshal(userPayload)
	fragment := url.Values{}
	fragment.Set("sso_token", accessToken)
	fragment.Set("sso_user", string(userJSON))
	http.Redirect(w, r, redirectURL+"#"+fragment.Encode(), http.StatusFound)
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func normalizeLoginID(loginID string) string {
	return strings.ToLower(strings.TrimSpace(loginID))
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func stringFromAny(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case float64:
		if typed == float64(int64(typed)) {
			return strconv.FormatInt(int64(typed), 10)
		}
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case int64:
		return strconv.FormatInt(typed, 10)
	case int:
		return strconv.Itoa(typed)
	default:
		return strings.TrimSpace(fmt.Sprint(value))
	}
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

func envBool(key string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	switch value {
	case "1", "true", "yes", "y", "on":
		return true
	case "0", "false", "no", "n", "off":
		return false
	default:
		return fallback
	}
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

func scanFamilyInvitation(w http.ResponseWriter, scanner interface{ Scan(...any) error }) (familyInvitation, bool) {
	var item familyInvitation
	var createdAt time.Time
	var respondedAt sql.NullTime
	err := scanner.Scan(
		&item.ID,
		&item.FamilyID,
		&item.FamilyName,
		&item.InviterUserID,
		&item.InviterName,
		&item.InviteeUserID,
		&item.InviteeEmail,
		&item.InviteeName,
		&item.Role,
		&item.CanRead,
		&item.CanCreate,
		&item.CanUpdate,
		&item.CanDelete,
		&item.Status,
		&createdAt,
		&respondedAt,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database scan failed")
		return item, false
	}
	item.CreatedAt = formatTime(createdAt)
	if respondedAt.Valid {
		item.RespondedAt = formatTime(respondedAt.Time)
	}
	return item, true
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

func (a *app) requireFamilyAdmin(w http.ResponseWriter, ctx context.Context, user authUser, familyID int64) bool {
	if user.PlatformAdmin {
		return true
	}
	var allowed bool
	err := a.db.QueryRow(ctx, `
		select exists(
			select 1 from family_members
			where family_id = $1 and user_id = $2 and role = 'FAMILY_ADMIN'
		)
	`, familyID, user.ID).Scan(&allowed)
	if err != nil || !allowed {
		writeError(w, http.StatusForbidden, "family admin permission required")
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
			insert into ledger_entries (family_id, title, entry_type, category, payment_method, member_name, amount, transaction_date, memo, created_at, updated_at)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
			returning id, family_id, title, entry_type, category, payment_method, member_name, coalesce(amount, 0), transaction_date, memo, created_at
		`, familyID, req.Title, req.EntryType, req.Category, req.PaymentMethod, req.MemberName, req.Amount, req.TransactionDate, req.Memo).
			Scan(&item.ID, &item.FamilyID, &item.Title, &item.EntryType, &category, &payment, &member, &item.Amount, &transactionDate, &memo, &createdAt)
	} else {
		err = a.db.QueryRow(r.Context(), `
			update ledger_entries set title = $1, entry_type = $2, category = $3, payment_method = $4, member_name = $5, amount = $6, transaction_date = $7, memo = $8, updated_at = now()
			where id = $9 and family_id = $10 and deleted_at is null
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
			insert into family_schedules (family_id, title, calendar_basis, schedule_date, schedule_time, category, member_name, repeat_rule, memo, created_at, updated_at)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())
			returning id, family_id, title, calendar_basis, schedule_date, schedule_time::text, category, member_name, repeat_rule, memo, created_at
		`, familyID, req.Title, req.CalendarBasis, req.ScheduleDate, req.ScheduleTime, req.Category, req.MemberName, req.RepeatRule, req.Memo).
			Scan(&item.ID, &item.FamilyID, &item.Title, &item.CalendarBasis, &scheduleDate, &scheduleTime, &category, &member, &repeat, &memo, &createdAt)
	} else {
		err = a.db.QueryRow(r.Context(), `
			update family_schedules set title=$1, calendar_basis=$2, schedule_date=$3, schedule_time=$4, category=$5, member_name=$6, repeat_rule=$7, memo=$8, updated_at=now()
			where id=$9 and family_id=$10 and deleted_at is null
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
			insert into trips (family_id, title, start_date, end_date, description, created_at, updated_at)
			values ($1,$2,$3,$4,$5,now(),now())
			returning id, family_id, title, start_date, end_date, description, created_at
		`, familyID, req.Title, req.StartDate, req.EndDate, req.Description).
			Scan(&item.ID, &item.FamilyID, &item.Title, &startDate, &endDate, &description, &createdAt)
	} else {
		err = a.db.QueryRow(r.Context(), `
			update trips set title=$1, start_date=$2, end_date=$3, description=$4, updated_at=now()
			where id=$5 and family_id=$6 and deleted_at is null
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
			insert into travel_records (trip_id, sort_order, title, category, amount, note, location, latitude, longitude, record_date, record_time, created_at, updated_at)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now())
			returning id, trip_id, sort_order, title, category, coalesce(amount, 0), note, location, latitude, longitude, record_date, record_time::text, created_at
		`, tripID, req.SortOrder, req.Title, req.Category, req.Amount, req.Note, req.Location, req.Latitude, req.Longitude, req.RecordDate, req.RecordTime).
			Scan(&item.ID, &item.TripID, &sortOrder, &item.Title, &category, &item.Amount, &note, &item.Location, &item.Latitude, &item.Longitude, &recordDate, &recordTime, &createdAt)
	} else {
		err = tx.QueryRow(r.Context(), `
			update travel_records set sort_order=$1, title=$2, category=$3, amount=$4, note=$5, location=$6, latitude=$7, longitude=$8, record_date=$9, record_time=$10, updated_at=now()
			where id=$11 and trip_id=$12 and deleted_at is null
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
		from travel_records where trip_id = $1 and deleted_at is null order by sort_order asc nulls last, created_at desc
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

func nullInt64(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	return &value.Int64
}

func nullFloat(value sql.NullFloat64) *float64 {
	if !value.Valid {
		return nil
	}
	return &value.Float64
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(getenv(key, ""))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func parseSize(value string, fallback int64) int64 {
	value = strings.ToUpper(strings.TrimSpace(value))
	multiplier := int64(1)
	for suffix, unit := range map[string]int64{"KB": 1024, "MB": 1024 * 1024, "GB": 1024 * 1024 * 1024} {
		if strings.HasSuffix(value, suffix) {
			multiplier = unit
			value = strings.TrimSuffix(value, suffix)
			break
		}
	}
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed * multiplier
}

func safeExtension(name string) string {
	ext := strings.ToLower(filepath.Ext(filepath.Base(name)))
	if len(ext) > 12 {
		return ""
	}
	for _, ch := range ext {
		if !(ch == '.' || ch >= 'a' && ch <= 'z' || ch >= '0' && ch <= '9') {
			return ""
		}
	}
	return ext
}

func (a *app) validateMediaReferences(w http.ResponseWriter, mediaURLs []string) ([]string, bool) {
	if len(mediaURLs) > a.cfg.maxFilesPerPost {
		writeError(w, http.StatusRequestEntityTooLarge, "too many media files")
		return nil, false
	}
	out := []string{}
	for _, item := range mediaURLs {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if len(item) > a.cfg.maxReferenceLength {
			writeError(w, http.StatusRequestEntityTooLarge, "media reference is too large")
			return nil, false
		}
		out = append(out, item)
	}
	return out, true
}

type babyPayload struct {
	Name           string   `json:"name"`
	Gender         *string  `json:"gender"`
	BirthDate      string   `json:"birthDate"`
	Memo           *string  `json:"memo"`
	PhotoURL       *string  `json:"photoUrl"`
	LatestHeightCm *float64 `json:"latestHeightCm"`
	LatestWeightKg *float64 `json:"latestWeightKg"`
}

func readBabyPayload(w http.ResponseWriter, r *http.Request) (babyPayload, bool) {
	var req babyPayload
	if !readJSON(w, r, &req) {
		return req, false
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || !validDate(req.BirthDate) {
		writeError(w, http.StatusBadRequest, "name and birthDate are required")
		return req, false
	}
	return req, true
}

func (a *app) saveBaby(w http.ResponseWriter, r *http.Request, id int64, familyID int64, req babyPayload) (babyProfileItem, bool) {
	var item babyProfileItem
	var gender, memo, photo sql.NullString
	var height, weight sql.NullFloat64
	var birthDate, createdAt time.Time
	var err error
	if id == 0 {
		err = a.db.QueryRow(r.Context(), `
			insert into baby_profiles (family_id, name, gender, birth_date, memo, photo_url, latest_height_cm, latest_weight_kg, created_at, updated_at)
			values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())
			returning id, family_id, name, gender, birth_date, memo, photo_url, latest_height_cm, latest_weight_kg, created_at
		`, familyID, req.Name, req.Gender, req.BirthDate, req.Memo, req.PhotoURL, req.LatestHeightCm, req.LatestWeightKg).
			Scan(&item.ID, &item.FamilyID, &item.Name, &gender, &birthDate, &memo, &photo, &height, &weight, &createdAt)
	} else {
		err = a.db.QueryRow(r.Context(), `
			update baby_profiles set name=$1, gender=$2, birth_date=$3, memo=$4, photo_url=$5, latest_height_cm=$6, latest_weight_kg=$7, updated_at=now()
			where id=$8 and family_id=$9 and deleted_at is null
			returning id, family_id, name, gender, birth_date, memo, photo_url, latest_height_cm, latest_weight_kg, created_at
		`, req.Name, req.Gender, req.BirthDate, req.Memo, req.PhotoURL, req.LatestHeightCm, req.LatestWeightKg, id, familyID).
			Scan(&item.ID, &item.FamilyID, &item.Name, &gender, &birthDate, &memo, &photo, &height, &weight, &createdAt)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "baby save failed")
		return item, false
	}
	item.Gender = nullString(gender)
	item.BirthDate = formatDate(birthDate)
	item.Memo = nullString(memo)
	item.PhotoURL = nullString(photo)
	item.LatestHeightCm = nullFloat(height)
	item.LatestWeightKg = nullFloat(weight)
	item.CreatedAt = formatTime(createdAt)
	return item, true
}

func scanBabies(w http.ResponseWriter, rows pgx.Rows) ([]babyProfileItem, bool) {
	items := []babyProfileItem{}
	for rows.Next() {
		var item babyProfileItem
		var gender, memo, photo sql.NullString
		var height, weight sql.NullFloat64
		var birthDate, createdAt time.Time
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.Name, &gender, &birthDate, &memo, &photo, &height, &weight, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.Gender = nullString(gender)
		item.BirthDate = formatDate(birthDate)
		item.Memo = nullString(memo)
		item.PhotoURL = nullString(photo)
		item.LatestHeightCm = nullFloat(height)
		item.LatestWeightKg = nullFloat(weight)
		item.CreatedAt = formatTime(createdAt)
		items = append(items, item)
	}
	return items, true
}

type babyRecordPayload struct {
	RecordType string   `json:"recordType"`
	RecordDate string   `json:"recordDate"`
	RecordTime *string  `json:"recordTime"`
	AmountMl   *int     `json:"amountMl"`
	HeightCm   *float64 `json:"heightCm"`
	WeightKg   *float64 `json:"weightKg"`
	Memo       *string  `json:"memo"`
	MediaURLs  []string `json:"mediaUrls"`
}

func readBabyRecordPayload(w http.ResponseWriter, r *http.Request) (babyRecordPayload, bool) {
	var req babyRecordPayload
	if !readJSON(w, r, &req) {
		return req, false
	}
	req.RecordType = strings.TrimSpace(req.RecordType)
	if req.RecordType == "" || !validDate(req.RecordDate) {
		writeError(w, http.StatusBadRequest, "recordType and recordDate are required")
		return req, false
	}
	return req, true
}

func (a *app) saveBabyRecord(w http.ResponseWriter, r *http.Request, id int64, babyID int64, req babyRecordPayload) (babyRecordItem, bool) {
	mediaURLs, ok := a.validateMediaReferences(w, req.MediaURLs)
	if !ok {
		return babyRecordItem{}, false
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return babyRecordItem{}, false
	}
	defer tx.Rollback(r.Context())
	var item babyRecordItem
	var recordTime, memo sql.NullString
	var amount sql.NullInt32
	var height, weight sql.NullFloat64
	var recordDate, createdAt time.Time
	if id == 0 {
		err = tx.QueryRow(r.Context(), `
			insert into baby_records (baby_id, record_type, record_date, record_time, amount_ml, height_cm, weight_kg, memo, created_at, updated_at)
			values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())
			returning id, baby_id, record_type, record_date, record_time, amount_ml, height_cm, weight_kg, memo, created_at
		`, babyID, req.RecordType, req.RecordDate, req.RecordTime, req.AmountMl, req.HeightCm, req.WeightKg, req.Memo).
			Scan(&item.ID, &item.BabyID, &item.RecordType, &recordDate, &recordTime, &amount, &height, &weight, &memo, &createdAt)
	} else {
		err = tx.QueryRow(r.Context(), `
			update baby_records set record_type=$1, record_date=$2, record_time=$3, amount_ml=$4, height_cm=$5, weight_kg=$6, memo=$7, updated_at=now()
			where id=$8 and baby_id=$9 and deleted_at is null
			returning id, baby_id, record_type, record_date, record_time, amount_ml, height_cm, weight_kg, memo, created_at
		`, req.RecordType, req.RecordDate, req.RecordTime, req.AmountMl, req.HeightCm, req.WeightKg, req.Memo, id, babyID).
			Scan(&item.ID, &item.BabyID, &item.RecordType, &recordDate, &recordTime, &amount, &height, &weight, &memo, &createdAt)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "baby record save failed")
		return item, false
	}
	_, _ = tx.Exec(r.Context(), "delete from baby_record_media_urls where baby_record_id = $1", item.ID)
	for _, mediaURL := range mediaURLs {
		if _, err := tx.Exec(r.Context(), "insert into baby_record_media_urls (baby_record_id, media_urls) values ($1,$2)", item.ID, mediaURL); err != nil {
			writeError(w, http.StatusInternalServerError, "media save failed")
			return item, false
		}
	}
	if req.HeightCm != nil || req.WeightKg != nil {
		_, _ = tx.Exec(r.Context(), "update baby_profiles set latest_height_cm = coalesce($1, latest_height_cm), latest_weight_kg = coalesce($2, latest_weight_kg), updated_at = now() where id = $3 and deleted_at is null", req.HeightCm, req.WeightKg, babyID)
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return item, false
	}
	item.RecordDate = formatDate(recordDate)
	item.RecordTime = nullString(recordTime)
	item.AmountMl = nullInt(amount)
	item.HeightCm = nullFloat(height)
	item.WeightKg = nullFloat(weight)
	item.Memo = nullString(memo)
	item.MediaURLs = mediaURLs
	item.CreatedAt = formatTime(createdAt)
	return item, true
}

func (a *app) scanBabyRecords(w http.ResponseWriter, ctx context.Context, rows pgx.Rows) ([]babyRecordItem, bool) {
	items := []babyRecordItem{}
	for rows.Next() {
		var item babyRecordItem
		var recordTime, memo sql.NullString
		var amount sql.NullInt32
		var height, weight sql.NullFloat64
		var recordDate, createdAt time.Time
		if err := rows.Scan(&item.ID, &item.BabyID, &item.RecordType, &recordDate, &recordTime, &amount, &height, &weight, &memo, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.RecordDate = formatDate(recordDate)
		item.RecordTime = nullString(recordTime)
		item.AmountMl = nullInt(amount)
		item.HeightCm = nullFloat(height)
		item.WeightKg = nullFloat(weight)
		item.Memo = nullString(memo)
		item.MediaURLs = a.mediaURLs(ctx, "baby_record_media_urls", "baby_record_id", item.ID)
		item.CreatedAt = formatTime(createdAt)
		items = append(items, item)
	}
	return items, true
}

type diaryPayload struct {
	Title          string   `json:"title"`
	Body           string   `json:"body"`
	DiaryDate      string   `json:"diaryDate"`
	Weather        *string  `json:"weather"`
	Mood           *string  `json:"mood"`
	MinTemperature *int     `json:"minTemperature"`
	MaxTemperature *int     `json:"maxTemperature"`
	MediaURLs      []string `json:"mediaUrls"`
}

func readDiaryPayload(w http.ResponseWriter, r *http.Request) (diaryPayload, bool) {
	var req diaryPayload
	if !readJSON(w, r, &req) {
		return req, false
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" || !validDate(req.DiaryDate) {
		writeError(w, http.StatusBadRequest, "title and diaryDate are required")
		return req, false
	}
	return req, true
}

func (a *app) saveDiary(w http.ResponseWriter, r *http.Request, id int64, familyID int64, req diaryPayload) (diaryItem, bool) {
	mediaURLs, ok := a.validateMediaReferences(w, req.MediaURLs)
	if !ok {
		return diaryItem{}, false
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return diaryItem{}, false
	}
	defer tx.Rollback(r.Context())
	var item diaryItem
	var weather, mood sql.NullString
	var minTemp, maxTemp sql.NullInt32
	var diaryDate, createdAt time.Time
	if id == 0 {
		err = tx.QueryRow(r.Context(), `
			insert into family_diaries (family_id, title, body, diary_date, weather, mood, min_temperature, max_temperature, created_at, updated_at)
			values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())
			returning id, family_id, title, body::text, diary_date, weather, mood, min_temperature, max_temperature, created_at
		`, familyID, req.Title, req.Body, req.DiaryDate, req.Weather, req.Mood, req.MinTemperature, req.MaxTemperature).
			Scan(&item.ID, &item.FamilyID, &item.Title, &item.Body, &diaryDate, &weather, &mood, &minTemp, &maxTemp, &createdAt)
	} else {
		err = tx.QueryRow(r.Context(), `
			update family_diaries set title=$1, body=$2, diary_date=$3, weather=$4, mood=$5, min_temperature=$6, max_temperature=$7, updated_at=now()
			where id=$8 and family_id=$9 and deleted_at is null
			returning id, family_id, title, body::text, diary_date, weather, mood, min_temperature, max_temperature, created_at
		`, req.Title, req.Body, req.DiaryDate, req.Weather, req.Mood, req.MinTemperature, req.MaxTemperature, id, familyID).
			Scan(&item.ID, &item.FamilyID, &item.Title, &item.Body, &diaryDate, &weather, &mood, &minTemp, &maxTemp, &createdAt)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "diary save failed")
		return item, false
	}
	_, _ = tx.Exec(r.Context(), "delete from family_diary_media_urls where family_diary_id = $1", item.ID)
	for _, mediaURL := range mediaURLs {
		if _, err := tx.Exec(r.Context(), "insert into family_diary_media_urls (family_diary_id, media_urls) values ($1,$2)", item.ID, mediaURL); err != nil {
			writeError(w, http.StatusInternalServerError, "media save failed")
			return item, false
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return item, false
	}
	item.DiaryDate = formatDate(diaryDate)
	item.Weather = nullString(weather)
	item.Mood = nullString(mood)
	item.MinTemperature = nullInt(minTemp)
	item.MaxTemperature = nullInt(maxTemp)
	item.MediaURLs = mediaURLs
	item.CreatedAt = formatTime(createdAt)
	return item, true
}

func (a *app) scanDiaries(w http.ResponseWriter, ctx context.Context, rows pgx.Rows) ([]diaryItem, bool) {
	items := []diaryItem{}
	for rows.Next() {
		var item diaryItem
		var weather, mood sql.NullString
		var minTemp, maxTemp sql.NullInt32
		var diaryDate, createdAt time.Time
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.Title, &item.Body, &diaryDate, &weather, &mood, &minTemp, &maxTemp, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.DiaryDate = formatDate(diaryDate)
		item.Weather = nullString(weather)
		item.Mood = nullString(mood)
		item.MinTemperature = nullInt(minTemp)
		item.MaxTemperature = nullInt(maxTemp)
		item.MediaURLs = a.mediaURLs(ctx, "family_diary_media_urls", "family_diary_id", item.ID)
		item.CreatedAt = formatTime(createdAt)
		items = append(items, item)
	}
	return items, true
}

type communityPostPayload struct {
	BoardType string   `json:"boardType"`
	FamilyID  *int64   `json:"familyId"`
	Title     string   `json:"title"`
	Body      string   `json:"body"`
	MediaURLs []string `json:"mediaUrls"`
}

func normalizeBoard(w http.ResponseWriter, board string) (string, bool) {
	board = strings.ToLower(strings.TrimSpace(board))
	if board != "notice" && board != "free" && board != "inquiry" {
		writeError(w, http.StatusBadRequest, "unsupported board type")
		return "", false
	}
	return board, true
}

func readCommunityPostPayload(w http.ResponseWriter, r *http.Request) (communityPostPayload, bool) {
	var req communityPostPayload
	if !readJSON(w, r, &req) {
		return req, false
	}
	var ok bool
	req.BoardType, ok = normalizeBoard(w, req.BoardType)
	if !ok {
		return req, false
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return req, false
	}
	if req.BoardType == "notice" || req.BoardType == "free" {
		req.FamilyID = nil
	}
	return req, true
}

func (a *app) requireBoardRead(w http.ResponseWriter, user authUser, board string) bool {
	if board == "inquiry" && !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return false
	}
	return true
}

func (a *app) requireBoardWrite(w http.ResponseWriter, user authUser, board string) bool {
	if (board == "notice" || board == "inquiry") && !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return false
	}
	return true
}

func (a *app) requirePostRead(w http.ResponseWriter, ctx context.Context, user authUser, post communityPostItem) bool {
	if post.BoardType == "inquiry" && !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return false
	}
	if post.FamilyID != nil {
		return a.requireFamilyPermission(w, ctx, user, *post.FamilyID, "read")
	}
	return true
}

func (a *app) requirePostWrite(w http.ResponseWriter, user authUser, post communityPostItem) bool {
	if user.PlatformAdmin {
		return true
	}
	if post.BoardType == "notice" || post.BoardType == "inquiry" || post.AuthorID == nil || *post.AuthorID != user.ID {
		writeError(w, http.StatusForbidden, "only the author can change this content")
		return false
	}
	return true
}

func (a *app) saveCommunityPost(w http.ResponseWriter, r *http.Request, id int64, user authUser, req communityPostPayload) (communityPostItem, bool) {
	mediaURLs, ok := a.validateMediaReferences(w, req.MediaURLs)
	if !ok {
		return communityPostItem{}, false
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return communityPostItem{}, false
	}
	defer tx.Rollback(r.Context())
	var item communityPostItem
	var familyID, authorID sql.NullInt64
	var createdAt, updatedAt time.Time
	if id == 0 {
		err = tx.QueryRow(r.Context(), `
			insert into community_posts (board_type, family_id, author_id, author_name, title, body, created_at, updated_at)
			values ($1,$2,$3,$4,$5,$6,now(),now())
			returning id, board_type, family_id, author_id, author_name, title, body::text, coalesce(view_count,0), created_at, updated_at
		`, req.BoardType, req.FamilyID, user.ID, a.displayName(r.Context(), user), req.Title, req.Body).
			Scan(&item.ID, &item.BoardType, &familyID, &authorID, &item.AuthorName, &item.Title, &item.Body, &item.ViewCount, &createdAt, &updatedAt)
	} else {
		err = tx.QueryRow(r.Context(), `
			update community_posts set board_type=$1, family_id=$2, title=$3, body=$4, updated_at=now()
			where id=$5 and deleted_at is null
			returning id, board_type, family_id, author_id, author_name, title, body::text, coalesce(view_count,0), created_at, updated_at
		`, req.BoardType, req.FamilyID, req.Title, req.Body, id).
			Scan(&item.ID, &item.BoardType, &familyID, &authorID, &item.AuthorName, &item.Title, &item.Body, &item.ViewCount, &createdAt, &updatedAt)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "post save failed")
		return item, false
	}
	_, _ = tx.Exec(r.Context(), "delete from community_post_media_urls where community_post_id = $1", item.ID)
	for _, mediaURL := range mediaURLs {
		if _, err := tx.Exec(r.Context(), "insert into community_post_media_urls (community_post_id, media_urls) values ($1,$2)", item.ID, mediaURL); err != nil {
			writeError(w, http.StatusInternalServerError, "media save failed")
			return item, false
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return item, false
	}
	item.FamilyID = nullInt64(familyID)
	item.AuthorID = nullInt64(authorID)
	item.MediaURLs = mediaURLs
	item.CreatedAt = formatTime(createdAt)
	item.UpdatedAt = formatTime(updatedAt)
	return item, true
}

func (a *app) scanCommunityPosts(w http.ResponseWriter, ctx context.Context, rows pgx.Rows) ([]communityPostItem, bool) {
	items := []communityPostItem{}
	for rows.Next() {
		var item communityPostItem
		var familyID, authorID sql.NullInt64
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&item.ID, &item.BoardType, &familyID, &authorID, &item.AuthorName, &item.Title, &item.Body, &item.ViewCount, &createdAt, &updatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.FamilyID = nullInt64(familyID)
		item.AuthorID = nullInt64(authorID)
		item.MediaURLs = a.mediaURLs(ctx, "community_post_media_urls", "community_post_id", item.ID)
		item.CreatedAt = formatTime(createdAt)
		item.UpdatedAt = formatTime(updatedAt)
		items = append(items, item)
	}
	return items, true
}

func (a *app) communityPostByID(w http.ResponseWriter, ctx context.Context, postID int64) (communityPostItem, bool) {
	rows, err := a.db.Query(ctx, `select id, board_type, family_id, author_id, author_name, title, body::text, coalesce(view_count,0), created_at, updated_at from community_posts where id = $1 and deleted_at is null`, postID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return communityPostItem{}, false
	}
	defer rows.Close()
	items, ok := a.scanCommunityPosts(w, ctx, rows)
	if !ok || len(items) == 0 {
		writeError(w, http.StatusNotFound, "post not found")
		return communityPostItem{}, false
	}
	return items[0], true
}

func (a *app) recordCommunityPostView(ctx context.Context, postID int64) {
	_, _ = a.db.Exec(ctx, "update community_posts set view_count = coalesce(view_count,0) + 1 where id = $1 and deleted_at is null", postID)
	_, _ = a.db.Exec(ctx, `
		insert into community_post_view_stats (community_post_id, view_date, view_count)
		values ($1, current_date, 1)
		on conflict (community_post_id, view_date)
		do update set view_count = community_post_view_stats.view_count + 1
	`, postID)
}

func (a *app) communityComments(w http.ResponseWriter, ctx context.Context, postID int64) ([]communityCommentItem, bool) {
	rows, err := a.db.Query(ctx, `
		select id, post_id, author_id, author_name, body::text, created_at, updated_at
		from community_comments where post_id = $1 and deleted_at is null order by created_at asc
	`, postID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return nil, false
	}
	defer rows.Close()
	items := []communityCommentItem{}
	for rows.Next() {
		var item communityCommentItem
		var authorID sql.NullInt64
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&item.ID, &item.PostID, &authorID, &item.AuthorName, &item.Body, &createdAt, &updatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.AuthorID = nullInt64(authorID)
		item.CreatedAt = formatTime(createdAt)
		item.UpdatedAt = formatTime(updatedAt)
		items = append(items, item)
	}
	return items, true
}

func (a *app) commentOwner(w http.ResponseWriter, ctx context.Context, commentID int64) (communityCommentItem, bool) {
	rows, err := a.db.Query(ctx, `select id, post_id, author_id, author_name, body::text, created_at, updated_at from community_comments where id = $1 and deleted_at is null`, commentID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return communityCommentItem{}, false
	}
	defer rows.Close()
	items := []communityCommentItem{}
	for rows.Next() {
		var item communityCommentItem
		var authorID sql.NullInt64
		var createdAt, updatedAt time.Time
		if rows.Scan(&item.ID, &item.PostID, &authorID, &item.AuthorName, &item.Body, &createdAt, &updatedAt) == nil {
			item.AuthorID = nullInt64(authorID)
			item.CreatedAt = formatTime(createdAt)
			item.UpdatedAt = formatTime(updatedAt)
			items = append(items, item)
		}
	}
	if len(items) == 0 {
		writeError(w, http.StatusNotFound, "comment not found")
		return communityCommentItem{}, false
	}
	return items[0], true
}

func (a *app) displayName(ctx context.Context, user authUser) string {
	var nickname sql.NullString
	if a.db.QueryRow(ctx, "select nickname from app_users where id = $1", user.ID).Scan(&nickname) == nil && nickname.Valid && strings.TrimSpace(nickname.String) != "" {
		return nickname.String
	}
	return user.Email
}

func scanNotifications(w http.ResponseWriter, rows pgx.Rows) ([]notificationItem, bool) {
	items := []notificationItem{}
	for rows.Next() {
		item, ok := scanNotificationValues(w, rows)
		if !ok {
			return nil, false
		}
		items = append(items, item)
	}
	return items, true
}

type scanner interface {
	Scan(dest ...any) error
}

func scanNotificationRow(w http.ResponseWriter, row scanner) (notificationItem, bool) {
	return scanNotificationValues(w, row)
}

func scanNotificationValues(w http.ResponseWriter, row scanner) (notificationItem, bool) {
	var item notificationItem
	var scheduleID sql.NullInt64
	var targetDate time.Time
	var readAt sql.NullTime
	var createdAt time.Time
	if err := row.Scan(&item.ID, &item.UserID, &item.FamilyID, &scheduleID, &item.Type, &item.Title, &item.Body, &targetDate, &readAt, &createdAt); err != nil {
		writeError(w, http.StatusNotFound, "notification not found")
		return item, false
	}
	item.ScheduleID = nullInt64(scheduleID)
	item.TargetDate = formatDate(targetDate)
	if readAt.Valid {
		value := formatTime(readAt.Time)
		item.ReadAt = &value
	}
	item.CreatedAt = formatTime(createdAt)
	return item, true
}
