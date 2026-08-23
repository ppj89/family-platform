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
	"encoding/xml"
	"errors"
	"fmt"
	"html"
	"io"
	"log/slog"
	"math"
	"mime"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2/google"
	"golang.org/x/text/encoding/korean"
)

const (
	maxFailedLoginAttempts      = 5
	lockDuration                = 5 * time.Minute
	maxJSONBodyBytes            = 1 << 20
	maxPasswordBytes            = 128
	maxCommunityPostTitleRunes  = 255
	maxCommunityPostBodyRunes   = 5000
	maxCommunityCommentRunes    = 1000
	freeCommunityPostCooldown   = 10 * time.Minute
	managedBatchManualCooldown  = 20 * time.Minute
	maxEmailVerificationResends = 2
)

var shareableMenuKeys = []string{"calendar", "ledger", "travel", "baby", "diary", "restaurant", "community"}
var shareableMenuKeySet = map[string]bool{
	"calendar":   true,
	"ledger":     true,
	"travel":     true,
	"baby":       true,
	"diary":      true,
	"restaurant": true,
	"community":  true,
}

type config struct {
	port                           string
	databaseURL                    string
	allowedOrigins                 []string
	tokenSecret                    []byte
	tokenValiditySeconds           int64
	autoLoginValiditySeconds       int64
	mediaStorageDriver             string
	mediaStoragePath               string
	mediaPublicPrefix              string
	mediaS3Endpoint                string
	mediaS3Region                  string
	mediaS3Bucket                  string
	mediaS3AccessKey               string
	mediaS3SecretKey               string
	publicBaseURL                  string
	oauth                          map[string]oauthProviderConfig
	kakaoRestAPIKey                string
	googlePlacesAPIKey             string
	naverSearchClientID            string
	naverSearchClientSecret        string
	maxFilesPerPost                int
	maxReferenceLength             int
	maxImageBytes                  int64
	maxVideoBytes                  int64
	mediaUserQuotaBytes            int64
	mediaSizeLimitsEnabled         bool
	mediaMenuLimitsEnabled         bool
	mediaMenuMaxFiles              map[string]int
	emailVerificationRequired      bool
	withdrawnAccountRetentionDays  int
	activityHistoryRetentionDays   int
	activityAggregateRetentionDays int
	holidaySyncEnabled             bool
	holidayServiceKey              string
	holidayAPIBaseURL              string
	holidaySyncYearsBefore         int
	holidaySyncYearsAfter          int
	databaseBackupControlPath      string
	mailDailyLimit                 int
	brevoAPIKey                    string
	mailFromEmail                  string
	mailFromName                   string
	smtpHost                       string
	smtpPort                       string
	smtpUsername                   string
	smtpPassword                   string
	smtpFrom                       string
	firebaseServiceAccountPath     string
	firebaseProjectID              string
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
	cfg          config
	db           *pgxpool.Pool
	log          *slog.Logger
	mediaStore   mediaStore
	placeCache   placeSearchCache
	rateLimitMu  sync.Mutex
	rateLimiters map[string]rateLimitBucket
}

type rateLimitBucket struct {
	count   int
	resetAt time.Time
}

type authUser struct {
	ID            int64
	Email         string
	PlatformAdmin bool
	ExpiresAt     time.Time
	SessionID     string
}

type authResponse struct {
	AccessToken   string `json:"accessToken"`
	UserID        int64  `json:"userId"`
	Email         string `json:"email"`
	LoginEmail    string `json:"loginEmail,omitempty"`
	Nickname      string `json:"nickname"`
	PlatformAdmin bool   `json:"platformAdmin"`
	FamilyRole    string `json:"familyRole,omitempty"`
	FamilyID      int64  `json:"familyId,omitempty"`
	FamilyName    string `json:"familyName,omitempty"`
	FamilyCanRead bool   `json:"familyCanRead,omitempty"`
	Provider      string `json:"provider,omitempty"`
}

type oauthProfile struct {
	ProviderUserID string
	Email          string
	Nickname       string
}

var errActiveSessionExists = errors.New("active session exists")
var errOAuthEmailRequired = errors.New("oauth email consent is required")
var errAccountSuspended = errors.New("account suspended")
var errUserMediaQuotaExceeded = errors.New("user media storage quota exceeded")

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
	if _, err := api.purgePlatformAdminHistories(ctx); err != nil {
		logger.Warn("platform admin history purge failed", "error", err)
	}
	api.startExpiredUnverifiedAccountPurgeJob(ctx)
	api.startWithdrawnAccountPurgeJob(ctx)
	api.startActivityHistoryPurgeJob(ctx)
	api.startHolidaySyncJob(ctx)
	api.startMorningSchedulePushJob(ctx)
	api.startScheduleTimePushJob(ctx)
	api.startCommunityHotDealRefreshJob(ctx)

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
	autoLoginValidity, err := strconv.ParseInt(getenv("APP_SECURITY_AUTO_LOGIN_VALIDITY_SECONDS", "2592000"), 10, 64)
	if err != nil || autoLoginValidity < validity {
		return config{}, fmt.Errorf("APP_SECURITY_AUTO_LOGIN_VALIDITY_SECONDS must be at least APP_SECURITY_TOKEN_VALIDITY_SECONDS")
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
		port:                     getenv("PORT", "8080"),
		databaseURL:              databaseURL,
		allowedOrigins:           splitCSV(getenv("APP_CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")),
		tokenSecret:              []byte(secret),
		tokenValiditySeconds:     validity,
		autoLoginValiditySeconds: autoLoginValidity,
		mediaStorageDriver:       strings.ToLower(getenv("APP_MEDIA_STORAGE_DRIVER", "local")),
		mediaStoragePath:         getenv("APP_MEDIA_STORAGE_PATH", "uploads"),
		mediaPublicPrefix:        strings.TrimRight(getenv("APP_MEDIA_PUBLIC_URL_PREFIX", "/api/media/files"), "/"),
		mediaS3Endpoint:          strings.TrimRight(getenv("APP_MEDIA_S3_ENDPOINT", ""), "/"),
		mediaS3Region:            getenv("APP_MEDIA_S3_REGION", "auto"),
		mediaS3Bucket:            getenv("APP_MEDIA_S3_BUCKET", ""),
		mediaS3AccessKey:         getenv("APP_MEDIA_S3_ACCESS_KEY_ID", ""),
		mediaS3SecretKey:         getenv("APP_MEDIA_S3_SECRET_ACCESS_KEY", ""),
		publicBaseURL:            defaultPublicBaseURL(),
		oauth:                    loadOAuthProviders(),
		kakaoRestAPIKey:          getenv("APP_KAKAO_REST_API_KEY", getenv("APP_OAUTH_KAKAO_CLIENT_ID", "")),
		googlePlacesAPIKey:       firstNonEmpty(os.Getenv("APP_GOOGLE_PLACES_API_KEY"), os.Getenv("APP_GOOGLE_MAPS_API_KEY")),
		naverSearchClientID:      getenv("APP_NAVER_SEARCH_CLIENT_ID", ""),
		naverSearchClientSecret:  getenv("APP_NAVER_SEARCH_CLIENT_SECRET", ""),
		maxFilesPerPost:          envInt("APP_MEDIA_MAX_FILES_PER_POST", 5),
		maxReferenceLength:       envInt("APP_MEDIA_MAX_REFERENCE_LENGTH", 2048),
		maxImageBytes:            parseSize(getenv("APP_MEDIA_MAX_IMAGE_SIZE", "5MB"), 5*1024*1024),
		maxVideoBytes:            parseSize(getenv("APP_MEDIA_MAX_VIDEO_SIZE", "20MB"), 20*1024*1024),
		mediaUserQuotaBytes:      parseSize(getenv("APP_MEDIA_USER_QUOTA", "1GB"), 1024*1024*1024),
		// 파일 크기 제한은 기본 적용합니다. 운영 환경에서는 환경변수로 각각 조정할 수 있습니다.
		mediaSizeLimitsEnabled: envBool("APP_MEDIA_SIZE_LIMITS_ENABLED", true),
		// 메뉴별 미디어 수 제한은 운영 정책 확정 전까지 기본 비활성입니다.
		// 활성화 시 .env.production에서 APP_MEDIA_MENU_LIMITS_ENABLED=true와
		// APP_MEDIA_MENU_MAX_FILES 값을 함께 설정합니다.
		mediaMenuLimitsEnabled:         envBool("APP_MEDIA_MENU_LIMITS_ENABLED", false),
		mediaMenuMaxFiles:              parseMenuMediaMaxFiles(getenv("APP_MEDIA_MENU_MAX_FILES", "restaurant=6,baby=6,diary=6,community=4")),
		emailVerificationRequired:      envBool("APP_AUTH_EMAIL_VERIFICATION_REQUIRED", false),
		withdrawnAccountRetentionDays:  envClampedInt(getenv("APP_WITHDRAWN_ACCOUNT_RETENTION_DAYS", "365"), 365, 1, 3650),
		activityHistoryRetentionDays:   envClampedInt(getenv("APP_ACTIVITY_HISTORY_RETENTION_DAYS", "365"), 365, 30, 3650),
		activityAggregateRetentionDays: envClampedInt(getenv("APP_ACTIVITY_AGGREGATE_RETENTION_DAYS", "365"), 365, 365, 3650),
		holidaySyncEnabled:             envBool("APP_HOLIDAY_SYNC_ENABLED", true),
		holidayServiceKey:              getenv("APP_HOLIDAY_SYNC_SERVICE_KEY", ""),
		holidayAPIBaseURL:              getenv("APP_HOLIDAY_API_BASE_URL", "http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo"),
		holidaySyncYearsBefore:         envClampedInt(getenv("APP_HOLIDAY_SYNC_YEAR_WINDOW_BEFORE", "1"), 1, 0, 5),
		holidaySyncYearsAfter:          envClampedInt(getenv("APP_HOLIDAY_SYNC_YEAR_WINDOW_AFTER", "2"), 2, 0, 10),
		databaseBackupControlPath:      strings.TrimSpace(getenv("APP_DB_BACKUP_CONTROL_PATH", "")),
		mailDailyLimit:                 envInt("APP_MAIL_DAILY_LIMIT_PER_IDENTIFIER", 3),
		brevoAPIKey:                    getenv("APP_BREVO_API_KEY", ""),
		mailFromEmail:                  getenv("APP_MAIL_FROM_EMAIL", ""),
		mailFromName:                   getenv("APP_MAIL_FROM_NAME", "Family Platform"),
		smtpHost:                       getenv("APP_SMTP_HOST", ""),
		smtpPort:                       getenv("APP_SMTP_PORT", "587"),
		smtpUsername:                   getenv("APP_SMTP_USERNAME", ""),
		smtpPassword:                   getenv("APP_SMTP_PASSWORD", ""),
		smtpFrom:                       getenv("APP_SMTP_FROM", ""),
		firebaseServiceAccountPath:     getenv("APP_FIREBASE_SERVICE_ACCOUNT_PATH", ""),
		firebaseProjectID:              getenv("APP_FIREBASE_PROJECT_ID", "together-records"),
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
	mux.HandleFunc("POST /api/auth/session/restore", a.requireAuth(a.restoreSession))
	mux.HandleFunc("DELETE /api/auth/me", a.requireAuth(a.withdrawAccount))
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
	mux.HandleFunc("GET /api/holidays", a.requireAuth(a.listHolidays))
	mux.HandleFunc("POST /api/admin/holidays/sync", a.requireAuth(a.syncHolidaysNow))
	mux.HandleFunc("GET /api/admin/batches", a.requireAuth(a.listAdminBatches))
	mux.HandleFunc("POST /api/admin/batches/{batchKey}/run", a.requireAuth(a.runAdminBatch))
	mux.HandleFunc("GET /api/admin/analytics/dashboard", a.requireAuth(a.analyticsDashboard))
	mux.HandleFunc("GET /api/admin/analytics/detail", a.requireAuth(a.analyticsActivityDetails))
	mux.HandleFunc("GET /api/admin/analytics/activity-details", a.requireAuth(a.analyticsActivityDetails))
	mux.HandleFunc("GET /api/admin/analytics/members", a.requireAuth(a.analyticsMembers))
	mux.HandleFunc("GET /api/admin/community/deals", a.requireAuth(a.adminCommunityHotDeals))
	mux.HandleFunc("PATCH /api/admin/community/deals/publish", a.requireAuth(a.updateCommunityHotDealsPublished))
	mux.HandleFunc("GET /api/admin/users/search", a.requireAuth(a.searchAdminUsers))
	mux.HandleFunc("GET /api/admin/users/{userId}/data", a.requireAuth(a.adminUserData))
	mux.HandleFunc("GET /api/admin/moderation/users", a.requireAuth(a.listModerationUsers))
	mux.HandleFunc("GET /api/admin/moderation/users/{userId}/warnings", a.requireAuth(a.listModerationWarnings))
	mux.HandleFunc("POST /api/admin/moderation/warnings", a.requireAuth(a.issueModerationWarning))
	mux.HandleFunc("DELETE /api/admin/moderation/warnings/{warningId}", a.requireAuth(a.cancelModerationWarning))
	mux.HandleFunc("POST /api/admin/moderation/users/{userId}/release", a.requireAuth(a.releaseModerationUser))
	mux.HandleFunc("PATCH /api/admin/media-storage/users/{userId}", a.requireAuth(a.updateMediaStorageUnlimited))
	mux.HandleFunc("PATCH /api/admin/media-storage/users/{userId}/file-size-limit", a.requireAuth(a.updateMediaFileSizeUnlimited))
	mux.HandleFunc("POST /api/analytics/menu-view", a.requireAuth(a.recordMenuView))
	mux.HandleFunc("GET /api/notification-preferences", a.requireAuth(a.getNotificationPreferences))
	mux.HandleFunc("PATCH /api/notification-preferences", a.requireAuth(a.updateNotificationPreferences))
	mux.HandleFunc("PUT /api/push-devices", a.requireAuth(a.registerPushDevice))
	mux.HandleFunc("DELETE /api/push-devices/{deviceId}", a.requireAuth(a.deactivatePushDevice))
	mux.HandleFunc("GET /api/admin/account-inquiries", a.requireAuth(a.listAccountRecoveryInquiries))
	mux.HandleFunc("PATCH /api/admin/account-inquiries/{inquiryId}", a.requireAuth(a.updateAccountRecoveryInquiry))
	mux.HandleFunc("POST /api/admin/account-inquiries/{inquiryId}/reply", a.requireAuth(a.replyAccountRecoveryInquiry))
	mux.HandleFunc("GET /api/families", a.requireAuth(a.listFamilies))
	mux.HandleFunc("POST /api/families", a.requireAuth(a.createFamily))
	mux.HandleFunc("GET /api/families/{familyId}/members", a.requireAuth(a.listFamilyMembers))
	mux.HandleFunc("POST /api/families/{familyId}/members", a.requireAuth(a.addFamilyMember))
	mux.HandleFunc("PUT /api/families/{familyId}/members/{memberId}", a.requireAuth(a.updateFamilyMember))
	mux.HandleFunc("DELETE /api/families/{familyId}/members/{memberId}", a.requireAuth(a.deleteFamilyMember))
	mux.HandleFunc("GET /api/family-invitations", a.requireAuth(a.listFamilyInvitations))
	mux.HandleFunc("GET /api/families/{familyId}/invitations", a.requireAuth(a.listSentFamilyInvitations))
	mux.HandleFunc("POST /api/families/{familyId}/invitations", a.requireAuth(a.createFamilyInvitation))
	mux.HandleFunc("DELETE /api/family-invitations/{invitationId}", a.requireAuth(a.cancelFamilyInvitation))
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
	mux.HandleFunc("POST /api/schedules/{scheduleId}/exceptions", a.requireAuth(a.createScheduleException))
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
	mux.HandleFunc("GET /api/places/search", a.requireAuth(a.searchPlaces))
	mux.HandleFunc("GET /api/restaurants", a.requireAuth(a.listRestaurants))
	mux.HandleFunc("POST /api/restaurants", a.requireAuth(a.createRestaurant))
	mux.HandleFunc("PUT /api/restaurants/{restaurantId}", a.requireAuth(a.updateRestaurant))
	mux.HandleFunc("DELETE /api/restaurants/{restaurantId}", a.requireAuth(a.deleteRestaurant))
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
	mux.HandleFunc("GET /api/community/deals", a.requireAuth(a.listCommunityHotDeals))
	mux.HandleFunc("GET /api/community/posts", a.requireAuth(a.listCommunityPosts))
	mux.HandleFunc("POST /api/community/posts", a.requireAuth(a.createCommunityPost))
	mux.HandleFunc("GET /api/community/posts/best", a.requireAuth(a.listCommunityBestPosts))
	mux.HandleFunc("GET /api/community/posts/{postId}", a.requireAuth(a.getCommunityPost))
	mux.HandleFunc("PUT /api/community/posts/{postId}", a.requireAuth(a.updateCommunityPost))
	mux.HandleFunc("DELETE /api/community/posts/{postId}", a.requireAuth(a.deleteCommunityPost))
	mux.HandleFunc("POST /api/community/posts/{postId}/reaction", a.requireAuth(a.reactToCommunityPost))
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

type placeSearchResult struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Address   string  `json:"address"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Source    string  `json:"source"`
}

type placeSearchCache struct {
	mu    sync.Mutex
	items map[string]placeSearchCacheItem
}

type placeSearchCacheItem struct {
	expiresAt time.Time
	results   []placeSearchResult
}

func (a *app) searchPlaces(w http.ResponseWriter, r *http.Request, _ authUser) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if utf8.RuneCountInString(query) < 2 {
		writeJSON(w, http.StatusOK, []placeSearchResult{})
		return
	}
	limit := envClampedInt(r.URL.Query().Get("limit"), 5, 1, 10)
	if results, ok := a.cachedPlaceSearch(query, limit); ok {
		writeJSON(w, http.StatusOK, results)
		return
	}

	seen := map[string]bool{}
	results := make([]placeSearchResult, 0, limit)
	for _, candidateQuery := range placeSearchQueries(query) {
		naverResults, err := a.searchNaverPlaces(r.Context(), candidateQuery, limit-len(results))
		if err != nil {
			a.log.Warn("naver place search failed", "query", candidateQuery, "error", err)
			if isPlaceProviderAuthError(err) {
				break
			}
		}
		results = appendUniquePlaces(results, naverResults, seen, limit)
		if len(results) >= limit {
			break
		}
	}
	for _, candidateQuery := range placeSearchQueries(query) {
		if len(results) >= limit {
			break
		}
		kakaoResults, err := a.searchKakaoPlaces(r.Context(), candidateQuery, limit-len(results))
		if err != nil {
			a.log.Warn("kakao place search failed", "query", candidateQuery, "error", err)
			if isPlaceProviderAuthError(err) {
				break
			}
		}
		results = appendUniquePlaces(results, kakaoResults, seen, limit)
		if len(results) >= limit {
			break
		}
	}
	for _, candidateQuery := range placeSearchQueries(query) {
		if len(results) >= limit {
			break
		}
		googleResults, err := a.searchGooglePlaces(r.Context(), candidateQuery, limit-len(results))
		if err != nil {
			a.log.Warn("google place search failed", "query", candidateQuery, "error", err)
			break
		}
		results = appendUniquePlaces(results, googleResults, seen, limit)
	}
	if len(results) > 0 {
		a.storePlaceSearchCache(query, limit, results)
	}
	writeJSON(w, http.StatusOK, results)
}

func (a *app) cachedPlaceSearch(query string, limit int) ([]placeSearchResult, bool) {
	if a.placeCache.items == nil {
		return nil, false
	}
	key := placeSearchCacheKey(query, limit)
	a.placeCache.mu.Lock()
	defer a.placeCache.mu.Unlock()
	item, ok := a.placeCache.items[key]
	if !ok || time.Now().After(item.expiresAt) {
		delete(a.placeCache.items, key)
		return nil, false
	}
	return append([]placeSearchResult(nil), item.results...), true
}

func (a *app) storePlaceSearchCache(query string, limit int, results []placeSearchResult) {
	a.placeCache.mu.Lock()
	defer a.placeCache.mu.Unlock()
	if a.placeCache.items == nil {
		a.placeCache.items = map[string]placeSearchCacheItem{}
	}
	if len(a.placeCache.items) > 300 {
		now := time.Now()
		for key, item := range a.placeCache.items {
			if now.After(item.expiresAt) {
				delete(a.placeCache.items, key)
			}
		}
	}
	a.placeCache.items[placeSearchCacheKey(query, limit)] = placeSearchCacheItem{
		expiresAt: time.Now().Add(24 * time.Hour),
		results:   append([]placeSearchResult(nil), results...),
	}
}

func placeSearchCacheKey(query string, limit int) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(query)), " ")) + ":" + strconv.Itoa(limit)
}

func placeSearchQueries(query string) []string {
	base := strings.TrimSpace(query)
	if base == "" {
		return nil
	}
	queries := []string{base}
	add := func(value string) {
		value = strings.TrimSpace(strings.Join(strings.Fields(value), " "))
		if value == "" {
			return
		}
		for _, existing := range queries {
			if existing == value {
				return
			}
		}
		queries = append(queries, value)
	}
	withoutBranchSuffix := strings.TrimSuffix(strings.TrimSuffix(strings.TrimSuffix(base, "??"), "??"), "?")
	add(withoutBranchSuffix)
	add(strings.Join(strings.Fields(withoutBranchSuffix), ""))
	parts := strings.Fields(withoutBranchSuffix)
	if len(parts) > 1 {
		head := parts[0]
		tail := strings.Join(parts[1:], " ")
		add(tail + " " + head)
		add(tail + head)
		add(head + tail)
		if strings.HasSuffix(tail, "?") {
			trimmedTail := strings.TrimSuffix(tail, "?")
			add(trimmedTail + " " + head)
			add(head + " " + trimmedTail)
			add(trimmedTail + head)
			add(head + trimmedTail)
		}
	}
	return queries
}

func appendUniquePlaces(results, candidates []placeSearchResult, seen map[string]bool, limit int) []placeSearchResult {
	for _, item := range candidates {
		if len(results) >= limit {
			return results
		}
		key := strings.TrimSpace(item.Source + ":" + item.ID)
		if key == ":" {
			key = fmt.Sprintf("%s:%f:%f", item.Name, item.Latitude, item.Longitude)
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		results = append(results, item)
	}
	return results
}

func isPlaceProviderAuthError(err error) bool {
	if err == nil {
		return false
	}
	text := err.Error()
	return strings.Contains(text, "NotAuthorizedError") || strings.Contains(text, "disabled OPEN_MAP_AND_LOCAL") || strings.Contains(text, "returned 401") || strings.Contains(text, "returned 403")
}

func (a *app) searchKakaoPlaces(ctx context.Context, query string, limit int) ([]placeSearchResult, error) {
	key := strings.TrimSpace(a.cfg.kakaoRestAPIKey)
	if key == "" || limit <= 0 {
		return []placeSearchResult{}, nil
	}
	values := url.Values{}
	values.Set("query", query)
	values.Set("size", strconv.Itoa(limit))
	values.Set("page", "1")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://dapi.kakao.com/v2/local/search/keyword.json?"+values.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "KakaoAK "+key)
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("kakao local search returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var payload struct {
		Documents []struct {
			ID              string `json:"id"`
			PlaceName       string `json:"place_name"`
			AddressName     string `json:"address_name"`
			RoadAddressName string `json:"road_address_name"`
			X               string `json:"x"`
			Y               string `json:"y"`
		} `json:"documents"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	results := make([]placeSearchResult, 0, len(payload.Documents))
	for _, item := range payload.Documents {
		longitude, lonErr := strconv.ParseFloat(item.X, 64)
		latitude, latErr := strconv.ParseFloat(item.Y, 64)
		if lonErr != nil || latErr != nil {
			continue
		}
		name := strings.TrimSpace(item.PlaceName)
		address := firstNonEmpty(item.RoadAddressName, item.AddressName)
		results = append(results, placeSearchResult{
			ID:        firstNonEmpty(item.ID, fmt.Sprintf("%f,%f", latitude, longitude)),
			Name:      name,
			Address:   address,
			Latitude:  latitude,
			Longitude: longitude,
			Source:    "kakao",
		})
	}
	return results, nil
}

func (a *app) searchNaverPlaces(ctx context.Context, query string, limit int) ([]placeSearchResult, error) {
	clientID := strings.TrimSpace(a.cfg.naverSearchClientID)
	clientSecret := strings.TrimSpace(a.cfg.naverSearchClientSecret)
	if clientID == "" || clientSecret == "" || limit <= 0 {
		return []placeSearchResult{}, nil
	}
	display := limit
	if display > 5 {
		display = 5
	}
	values := url.Values{}
	values.Set("query", query)
	values.Set("display", strconv.Itoa(display))
	values.Set("start", "1")
	values.Set("sort", "random")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://openapi.naver.com/v1/search/local.json?"+values.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Naver-Client-Id", clientID)
	req.Header.Set("X-Naver-Client-Secret", clientSecret)
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("naver local search returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var payload struct {
		Items []struct {
			Title       string `json:"title"`
			Link        string `json:"link"`
			Category    string `json:"category"`
			Description string `json:"description"`
			Address     string `json:"address"`
			RoadAddress string `json:"roadAddress"`
			MapX        string `json:"mapx"`
			MapY        string `json:"mapy"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	results := make([]placeSearchResult, 0, len(payload.Items))
	for _, item := range payload.Items {
		name := cleanNaverPlaceText(item.Title)
		address := strings.TrimSpace(firstNonEmpty(item.RoadAddress, item.Address))
		if name == "" && address == "" {
			continue
		}
		latitude, longitude := parseNaverPlaceCoordinates(item.MapY, item.MapX)
		results = append(results, placeSearchResult{
			ID:        firstNonEmpty(strings.TrimSpace(item.Link), fmt.Sprintf("%s:%s:%s", name, item.MapY, item.MapX)),
			Name:      firstNonEmpty(name, address),
			Address:   address,
			Latitude:  latitude,
			Longitude: longitude,
			Source:    "naver",
		})
	}
	return results, nil
}

func cleanNaverPlaceText(value string) string {
	value = strings.NewReplacer("<b>", "", "</b>", "", "<B>", "", "</B>", "").Replace(value)
	return strings.TrimSpace(value)
}

func parseNaverPlaceCoordinates(rawLatitude, rawLongitude string) (float64, float64) {
	latitude, latErr := strconv.ParseFloat(strings.TrimSpace(rawLatitude), 64)
	longitude, lonErr := strconv.ParseFloat(strings.TrimSpace(rawLongitude), 64)
	if latErr != nil || lonErr != nil {
		return 0, 0
	}
	if validWGS84(latitude, longitude) {
		return latitude, longitude
	}
	scaledLatitude := latitude / 10000000
	scaledLongitude := longitude / 10000000
	if validWGS84(scaledLatitude, scaledLongitude) {
		return scaledLatitude, scaledLongitude
	}
	if latitude >= 300000 && latitude <= 900000 && longitude >= 100000 && longitude <= 600000 {
		convertedLatitude, convertedLongitude := katecToWGS84(longitude, latitude)
		if validWGS84(convertedLatitude, convertedLongitude) {
			return convertedLatitude, convertedLongitude
		}
	}
	return 0, 0
}

func validWGS84(latitude, longitude float64) bool {
	return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && latitude != 0 && longitude != 0
}

func katecToWGS84(x, y float64) (float64, float64) {
	const (
		semiMajorAxis      = 6377397.155
		inverseFlattening  = 299.1528128
		originLatitudeDeg  = 38.0
		originLongitudeDeg = 128.0
		scaleFactor        = 0.9999
		falseEasting       = 400000.0
		falseNorthing      = 600000.0
		degreesPerRadian   = 180.0 / math.Pi
		radiansPerDegree   = math.Pi / 180.0
	)
	flattening := 1 / inverseFlattening
	eccentricitySquared := 2*flattening - flattening*flattening
	secondEccentricitySquared := eccentricitySquared / (1 - eccentricitySquared)
	originLatitude := originLatitudeDeg * radiansPerDegree
	originLongitude := originLongitudeDeg * radiansPerDegree
	originMeridionalArc := meridionalArc(originLatitude, semiMajorAxis, eccentricitySquared)
	meridionalArcValue := originMeridionalArc + (y-falseNorthing)/scaleFactor
	mu := meridionalArcValue / (semiMajorAxis * (1 - eccentricitySquared/4 - 3*math.Pow(eccentricitySquared, 2)/64 - 5*math.Pow(eccentricitySquared, 3)/256))
	e1 := (1 - math.Sqrt(1-eccentricitySquared)) / (1 + math.Sqrt(1-eccentricitySquared))
	footprintLatitude := mu +
		(3*e1/2-27*math.Pow(e1, 3)/32)*math.Sin(2*mu) +
		(21*math.Pow(e1, 2)/16-55*math.Pow(e1, 4)/32)*math.Sin(4*mu) +
		(151*math.Pow(e1, 3)/96)*math.Sin(6*mu) +
		(1097*math.Pow(e1, 4)/512)*math.Sin(8*mu)
	sinFootprint := math.Sin(footprintLatitude)
	cosFootprint := math.Cos(footprintLatitude)
	tanFootprint := math.Tan(footprintLatitude)
	c1 := secondEccentricitySquared * math.Pow(cosFootprint, 2)
	t1 := math.Pow(tanFootprint, 2)
	n1 := semiMajorAxis / math.Sqrt(1-eccentricitySquared*math.Pow(sinFootprint, 2))
	r1 := semiMajorAxis * (1 - eccentricitySquared) / math.Pow(1-eccentricitySquared*math.Pow(sinFootprint, 2), 1.5)
	d := (x - falseEasting) / (n1 * scaleFactor)
	latitude := footprintLatitude - (n1*tanFootprint/r1)*(math.Pow(d, 2)/2-(5+3*t1+10*c1-4*math.Pow(c1, 2)-9*secondEccentricitySquared)*math.Pow(d, 4)/24+(61+90*t1+298*c1+45*math.Pow(t1, 2)-252*secondEccentricitySquared-3*math.Pow(c1, 2))*math.Pow(d, 6)/720)
	longitude := originLongitude + (d-(1+2*t1+c1)*math.Pow(d, 3)/6+(5-2*c1+28*t1-3*math.Pow(c1, 2)+8*secondEccentricitySquared+24*math.Pow(t1, 2))*math.Pow(d, 5)/120)/cosFootprint
	return latitude * degreesPerRadian, longitude * degreesPerRadian
}

func meridionalArc(latitude, semiMajorAxis, eccentricitySquared float64) float64 {
	return semiMajorAxis * ((1-eccentricitySquared/4-3*math.Pow(eccentricitySquared, 2)/64-5*math.Pow(eccentricitySquared, 3)/256)*latitude -
		(3*eccentricitySquared/8+3*math.Pow(eccentricitySquared, 2)/32+45*math.Pow(eccentricitySquared, 3)/1024)*math.Sin(2*latitude) +
		(15*math.Pow(eccentricitySquared, 2)/256+45*math.Pow(eccentricitySquared, 3)/1024)*math.Sin(4*latitude) -
		(35*math.Pow(eccentricitySquared, 3)/3072)*math.Sin(6*latitude))
}

func (a *app) searchGooglePlaces(ctx context.Context, query string, limit int) ([]placeSearchResult, error) {
	key := strings.TrimSpace(a.cfg.googlePlacesAPIKey)
	if key == "" || limit <= 0 {
		return []placeSearchResult{}, nil
	}
	body, err := json.Marshal(map[string]any{
		"textQuery":      query,
		"languageCode":   "ko",
		"regionCode":     "KR",
		"maxResultCount": limit,
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://places.googleapis.com/v1/places:searchText", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Goog-Api-Key", key)
	req.Header.Set("X-Goog-FieldMask", "places.id,places.displayName,places.formattedAddress,places.location")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("google places search returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var payload struct {
		Places []struct {
			ID          string `json:"id"`
			DisplayName struct {
				Text string `json:"text"`
			} `json:"displayName"`
			FormattedAddress string `json:"formattedAddress"`
			Location         struct {
				Latitude  float64 `json:"latitude"`
				Longitude float64 `json:"longitude"`
			} `json:"location"`
		} `json:"places"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	results := make([]placeSearchResult, 0, len(payload.Places))
	for _, item := range payload.Places {
		name := strings.TrimSpace(item.DisplayName.Text)
		address := strings.TrimSpace(item.FormattedAddress)
		if name == "" || item.Location.Latitude == 0 || item.Location.Longitude == 0 {
			continue
		}
		results = append(results, placeSearchResult{
			ID:        firstNonEmpty(item.ID, fmt.Sprintf("%f,%f", item.Location.Latitude, item.Location.Longitude)),
			Name:      name,
			Address:   address,
			Latitude:  item.Location.Latitude,
			Longitude: item.Location.Longitude,
			Source:    "google",
		})
	}
	return results, nil
}

func envClampedInt(value string, fallback, min, max int) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		parsed = fallback
	}
	if parsed < min {
		return min
	}
	if parsed > max {
		return max
	}
	return parsed
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
		if r >= '\uAC00' && r <= '\uD7A3' {
			continue
		}
		return false
	}
	return true
}

func (a *app) checkNickname(w http.ResponseWriter, r *http.Request) {
	if !a.allowRequest("auth:nickname:"+clientIP(r), 20, time.Minute) {
		writeError(w, http.StatusTooManyRequests, "too many requests")
		return
	}
	a.releaseExpiredUnverifiedAccounts(r.Context())
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
	if err := a.db.QueryRow(r.Context(), "select exists(select 1 from app_users where deleted_at is null and lower(nickname) = lower($1))", nickname).Scan(&exists); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"available": !exists,
		"nickname":  nickname,
	})
}

func (a *app) register(w http.ResponseWriter, r *http.Request) {
	if !a.allowRequest("auth:register:"+clientIP(r), 5, 10*time.Minute) {
		writeError(w, http.StatusTooManyRequests, "too many requests")
		return
	}
	a.releaseExpiredUnverifiedAccounts(r.Context())
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
	if email == "" || nickname == "" || !validPasswordLength(req.Password) {
		writeError(w, http.StatusBadRequest, "email, nickname and password length 8-128 bytes are required")
		return
	}
	if !isValidNickname(nickname) {
		writeError(w, http.StatusBadRequest, "nickname format invalid")
		return
	}
	var nicknameExists bool
	if err := a.db.QueryRow(r.Context(), "select exists(select 1 from app_users where deleted_at is null and lower(nickname) = lower($1))", nickname).Scan(&nicknameExists); err != nil {
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
	if err := tx.QueryRow(r.Context(), "select count(*) from app_users where deleted_at is null").Scan(&userCount); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	sessionExpiresAt := a.sessionExpiresAt(false)
	var activeSessionExpiresAt sql.NullTime
	if sessionID != "" {
		activeSessionExpiresAt = sql.NullTime{Time: sessionExpiresAt, Valid: true}
	}
	var userID int64
	err = tx.QueryRow(r.Context(), `
		insert into app_users (created_at, email, nickname, platform_admin, password_hash, active_session_id, active_session_expires_at, failed_login_attempts, email_verification_required, email_verified_at)
		values (now(), $1, $2, $3, $4, $5, $6, 0, $7, case when $7 then null else now() end)
		returning id
	`, email, nickname, userCount == 0, string(passwordHash), sessionID, activeSessionExpiresAt, requiresEmailVerification).Scan(&userID)
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
			"email":                        email,
			"nickname":                     nickname,
			"emailVerificationRequired":    true,
			"verificationResendsRemaining": maxEmailVerificationResends,
			"message":                      "email verification required",
		})
		return
	}
	user := authUser{ID: userID, Email: email, PlatformAdmin: userCount == 0, SessionID: sessionID}
	writeJSON(w, http.StatusCreated, authResponse{
		AccessToken:   a.issueToken(user, sessionExpiresAt),
		UserID:        userID,
		Email:         email,
		Nickname:      nickname,
		PlatformAdmin: user.PlatformAdmin,
		Provider:      "password",
	})
}

func (a *app) login(w http.ResponseWriter, r *http.Request) {
	if !a.allowRequest("auth:login:"+clientIP(r), 20, 5*time.Minute) {
		writeError(w, http.StatusTooManyRequests, "too many requests")
		return
	}
	var req struct {
		Email      string `json:"email"`
		Password   string `json:"password"`
		ForceLogin bool   `json:"forceLogin"`
		AutoLogin  bool   `json:"autoLogin"`
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
	var activeSessionExpiresAt sql.NullTime
	var lockedUntil sql.NullTime
	var moderationSuspendedAt sql.NullTime
	var emailVerifiedAt sql.NullTime
	var emailVerificationRequired bool
	var failedAttempts int
	err := a.db.QueryRow(r.Context(), `
		select id, coalesce(email, ''), coalesce(login_id, ''), nickname, platform_admin, coalesce(password_hash, ''), active_session_id, active_session_expires_at, locked_until, moderation_suspended_at, coalesce(failed_login_attempts, 0), email_verified_at, coalesce(email_verification_required, false)
		from app_users
		where deleted_at is null
		  and (
		    lower(email) = lower($1)
		    or (platform_admin = true and lower(login_id) = lower($2))
		  )
		order by case when lower(email) = lower($1) then 0 else 1 end
		limit 1
	`, email, loginID).Scan(&userID, &accountEmail, &accountLoginID, &nickname, &platformAdmin, &passwordHash, &activeSessionID, &activeSessionExpiresAt, &lockedUntil, &moderationSuspendedAt, &failedAttempts, &emailVerifiedAt, &emailVerificationRequired)
	loginName := firstNonEmpty(accountEmail, accountLoginID, identifier)
	if err != nil {
		a.recordLoginHistory(r.Context(), nil, identifier, "password", "LOGIN", "FAIL", "invalid identifier")
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if moderationSuspendedAt.Valid {
		writeError(w, http.StatusForbidden, "account suspended")
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
	if activeSessionID.Valid && activeSessionID.String != "" && activeSessionExpiresAt.Valid && activeSessionExpiresAt.Time.After(time.Now()) && !req.ForceLogin {
		a.recordLoginHistory(r.Context(), &userID, loginName, "password", "LOGIN", "ACTIVE_SESSION", "active session exists")
		writeError(w, http.StatusConflict, "active session exists")
		return
	}
	sessionID := newSessionID()
	sessionExpiresAt := a.sessionExpiresAt(req.AutoLogin)
	_, err = a.db.Exec(r.Context(), `
		update app_users
		set active_session_id = $1,
		    active_session_expires_at = $2,
		    failed_login_attempts = 0,
		    locked_until = null
		where id = $3
	`, sessionID, sessionExpiresAt, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "login failed")
		return
	}
	a.recordLoginHistory(r.Context(), &userID, loginName, "password", "LOGIN", "SUCCESS", "")
	user := authUser{ID: userID, Email: loginName, PlatformAdmin: platformAdmin, SessionID: sessionID}
	writeJSON(w, http.StatusOK, authResponse{
		AccessToken:   a.issueToken(user, sessionExpiresAt),
		UserID:        userID,
		Email:         loginName,
		Nickname:      nickname,
		PlatformAdmin: platformAdmin,
		Provider:      "password",
	})
}

func (a *app) logout(w http.ResponseWriter, r *http.Request, user authUser) {
	_, _ = a.db.Exec(r.Context(), "update app_users set active_session_id = null, active_session_expires_at = null where id = $1 and active_session_id = $2", user.ID, user.SessionID)
	a.recordLoginHistory(r.Context(), &user.ID, user.Email, "password", "LOGOUT", "SUCCESS", "")
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) withdrawAccount(w http.ResponseWriter, r *http.Request, user authUser) {
	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return
	}
	defer tx.Rollback(ctx)

	var email, nickname, provider, loginID string
	var platformAdmin bool
	if err := tx.QueryRow(ctx, `
		select coalesce(email, ''), coalesce(nickname, ''), coalesce(provider, ''), coalesce(login_id, ''), platform_admin
		from app_users
		where id = $1 and deleted_at is null
		for update
	`, user.ID).Scan(&email, &nickname, &provider, &loginID, &platformAdmin); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid session")
		return
	}

	rows, err := tx.Query(ctx, "select id, family_id, role from family_members where user_id = $1", user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	type membership struct {
		id       int64
		familyID int64
		role     string
	}
	memberships := []membership{}
	for rows.Next() {
		var item membership
		if err := rows.Scan(&item.id, &item.familyID, &item.role); err != nil {
			rows.Close()
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return
		}
		memberships = append(memberships, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "database scan failed")
		return
	}

	for _, item := range memberships {
		var memberCount, adminCount int
		if err := tx.QueryRow(ctx, `
			select count(*),
			       count(*) filter (where role = 'FAMILY_ADMIN')
			from family_members
			where family_id = $1
		`, item.familyID).Scan(&memberCount, &adminCount); err != nil {
			writeError(w, http.StatusInternalServerError, "database read failed")
			return
		}
		if memberCount <= 1 {
			if err := deleteFamilyGroupShellTx(ctx, tx, item.familyID); err != nil {
				writeError(w, http.StatusInternalServerError, "family group deletion failed")
				return
			}
			continue
		}
		if item.role == "FAMILY_ADMIN" && adminCount <= 1 {
			if _, err := tx.Exec(ctx, `
				update family_members
				set role = 'FAMILY_ADMIN', can_read = true, can_create = true, can_update = true, can_delete = true
				where id = (
					select id from family_members
					where family_id = $1 and user_id <> $2
					order by joined_at asc nulls last, id asc
					limit 1
				)
			`, item.familyID, user.ID); err != nil {
				writeError(w, http.StatusInternalServerError, "family admin promotion failed")
				return
			}
		}
		if _, err := tx.Exec(ctx, "delete from family_members where id = $1 and family_id = $2", item.id, item.familyID); err != nil {
			writeError(w, http.StatusInternalServerError, "family membership deletion failed")
			return
		}
	}

	if _, err := tx.Exec(ctx, "delete from family_invitations where inviter_user_id = $1 or invitee_user_id = $1", user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "invitation cleanup failed")
		return
	}
	if _, err := tx.Exec(ctx, "delete from app_notifications where user_id = $1", user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "notification cleanup failed")
		return
	}
	if _, err := tx.Exec(ctx, "delete from oauth_identities where user_id = $1", user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "oauth cleanup failed")
		return
	}
	if _, err := tx.Exec(ctx, "delete from email_verification_tokens where user_id = $1", user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "verification cleanup failed")
		return
	}
	if _, err := tx.Exec(ctx, "delete from password_reset_tokens where user_id = $1", user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "password reset cleanup failed")
		return
	}
	if _, err := tx.Exec(ctx, `
		update app_users
		set email = null,
		    login_id = null,
		    nickname = $2,
		    provider = null,
		    provider_user_id = null,
		    password_hash = null,
		    active_session_id = null,
		    active_session_expires_at = null,
		    locked_until = null,
		    failed_login_attempts = 0,
		    email_verification_required = false,
		    deleted_at = now()
		where id = $1 and deleted_at is null
	`, user.ID, fmt.Sprintf("탈퇴회원%d", user.ID)); err != nil {
		writeError(w, http.StatusInternalServerError, "account withdrawal failed")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return
	}

	a.recordLoginHistory(ctx, &user.ID, firstNonEmpty(email, loginID, user.Email), firstNonEmpty(provider, "password"), "WITHDRAW", "SUCCESS", "")
	a.recordDataChange(ctx, "app_user", user.ID, 0, user.ID, "withdraw", map[string]any{
		"id":            user.ID,
		"nickname":      nickname,
		"platformAdmin": platformAdmin,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) me(w http.ResponseWriter, r *http.Request, user authUser) {
	var nickname, loginName, provider, loginEmail string
	err := a.db.QueryRow(r.Context(), `
		select u.nickname,
		       coalesce(u.email, u.login_id, ''),
		       coalesce(u.provider, case when u.login_id is not null and u.login_id <> '' then 'admin' else 'password' end),
		       coalesce(oi.email, '')
		from app_users u
		left join oauth_identities oi on oi.user_id = u.id
		  and oi.provider = u.provider
		  and oi.provider_user_id = u.provider_user_id
		where u.id = $1 and u.deleted_at is null
	`, user.ID).Scan(&nickname, &loginName, &provider, &loginEmail)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid session")
		return
	}
	if loginName == "" {
		loginName = user.Email
	}
	// 가족 역할은 화면 권한의 기준입니다. 가족 목록 요청이 일시적으로 실패해도
	// 내정보/설정에서 관리자를 구성원으로 잘못 표시하지 않도록 인증 응답에 함께 보냅니다.
	var familyID int64
	var familyName, familyRole string
	var familyCanRead bool
	if err := a.db.QueryRow(r.Context(), `
		select m.family_id, f.name, coalesce(m.role, ''), m.can_read
		from family_members m
		join family_groups f on f.id = m.family_id
		where m.user_id = $1 and m.can_read = true
		order by m.joined_at asc, m.id asc
		limit 1
	`, user.ID).Scan(&familyID, &familyName, &familyRole, &familyCanRead); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "family role read failed")
		return
	}
	writeJSON(w, http.StatusOK, authResponse{
		AccessToken:   a.issueToken(user, user.ExpiresAt),
		UserID:        user.ID,
		Email:         loginName,
		LoginEmail:    loginEmail,
		Nickname:      nickname,
		PlatformAdmin: user.PlatformAdmin,
		FamilyRole:    familyRole,
		FamilyID:      familyID,
		FamilyName:    familyName,
		FamilyCanRead: familyCanRead,
		Provider:      provider,
	})
}

// restoreSession records an application start that resumed an already-valid
// automatic-login session. It is intentionally a separate endpoint so normal
// API reads do not inflate the login/visitor history.
func (a *app) restoreSession(w http.ResponseWriter, r *http.Request, user authUser) {
	a.recordLoginHistory(r.Context(), &user.ID, user.Email, "auto", "SESSION_RESTORE", "SUCCESS", "")
	w.WriteHeader(http.StatusNoContent)
}

type holidayItem struct {
	DateKey string `json:"dateKey"`
	Name    string `json:"name"`
	Source  string `json:"source"`
}

func (a *app) listHolidays(w http.ResponseWriter, r *http.Request, user authUser) {
	startDate := strings.TrimSpace(r.URL.Query().Get("startDate"))
	endDate := strings.TrimSpace(r.URL.Query().Get("endDate"))
	if !validDate(startDate) || !validDate(endDate) || endDate < startDate {
		writeError(w, http.StatusBadRequest, "valid startDate and endDate are required")
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select date_key::text, name, source
		from holidays
		where is_holiday = true and date_key between $1 and $2
		order by date_key asc
	`, startDate, endDate)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items := []holidayItem{}
	for rows.Next() {
		var item holidayItem
		if err := rows.Scan(&item.DateKey, &item.Name, &item.Source); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *app) syncHolidaysNow(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	years := holidaySyncYears(time.Now(), a.cfg.holidaySyncYearsBefore, a.cfg.holidaySyncYearsAfter)
	var req struct {
		Year int `json:"year"`
	}
	if r.Body != nil && r.ContentLength != 0 {
		if !readJSON(w, r, &req) {
			return
		}
		if req.Year > 0 {
			years = []int{req.Year}
		}
	}
	result, err := a.syncHolidayYears(r.Context(), years)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

type managedBatchDefinition struct {
	Key         string
	Label       string
	Schedule    string
	Description string
}

type managedBatchRun struct {
	StartedAt      time.Time  `json:"startedAt"`
	CompletedAt    *time.Time `json:"completedAt,omitempty"`
	Status         string     `json:"status"`
	ProcessedCount int64      `json:"processedCount"`
	Message        string     `json:"message,omitempty"`
}

type managedBatchItem struct {
	Key         string           `json:"key"`
	Label       string           `json:"label"`
	Schedule    string           `json:"schedule"`
	Description string           `json:"description"`
	LastRun     *managedBatchRun `json:"lastRun,omitempty"`
}

func managedBatchDefinitions() []managedBatchDefinition {
	return []managedBatchDefinition{
		{Key: "schedule-morning-push", Label: "오전 일정 알림", Schedule: "매일 09:00", Description: "내정보에서 오전 9시 알림을 설정한 사용자에게 오늘 일정 요약을 한 번 보냅니다."},
		{Key: "schedule-time-push", Label: "일정 시각 알림", Schedule: "상시 (매분 감시)", Description: "현재 시각의 알림 대상 일정을 확인해 푸시를 발송합니다. 수동 실행은 현재 시각 기준으로 처리합니다."},
		{Key: "holiday-sync", Label: "공휴일 동기화", Schedule: "매일 03:00", Description: "공공데이터포털 공휴일 데이터를 현재 기준 전후 연도로 동기화합니다."},
		{Key: "withdrawn-account-purge", Label: "탈퇴회원 정리", Schedule: "매일 03:20", Description: "탈퇴 후 1년이 지난 비활성화 계정을 물리 삭제합니다."},
		{Key: "history-purge", Label: "히스토리 정리", Schedule: "매일 03:40", Description: "1년이 지난 로그인, 변경, 활동 및 배치 이력을 삭제합니다."},
		{Key: "unverified-account-purge", Label: "미인증 가입 정리", Schedule: "매시간", Description: "인증 메일이 만료된 미가입 계정을 삭제해 이메일과 닉네임을 다시 사용할 수 있게 합니다."},
		{Key: "database-backup", Label: "데이터베이스 백업", Schedule: "매일 1회", Description: "데이터베이스 백업본을 외부 저장소에 보관하고 7일이 지난 백업본을 자동 삭제합니다."},
		{Key: "community-hotdeal-refresh", Label: "특가 정보 수집", Schedule: "30분마다", Description: "특가 출처의 최신 원문 링크, 제목, 요약, 가격을 다시 수집합니다."},
	}
}

func managedBatchDefinitionFor(key string) (managedBatchDefinition, bool) {
	for _, item := range managedBatchDefinitions() {
		if item.Key == key {
			return item, true
		}
	}
	return managedBatchDefinition{}, false
}

func (a *app) listAdminBatches(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	items := make([]managedBatchItem, 0, len(managedBatchDefinitions()))
	for _, definition := range managedBatchDefinitions() {
		item := managedBatchItem{
			Key:         definition.Key,
			Label:       definition.Label,
			Schedule:    definition.Schedule,
			Description: definition.Description,
		}
		var completedAt sql.NullTime
		var run managedBatchRun
		err := a.db.QueryRow(r.Context(), `
			select started_at, completed_at, status, processed_count, message
			from batch_run_histories
			where batch_key = $1
			order by id desc
			limit 1
		`, definition.Key).Scan(&run.StartedAt, &completedAt, &run.Status, &run.ProcessedCount, &run.Message)
		if err == nil {
			if completedAt.Valid {
				completed := completedAt.Time
				run.CompletedAt = &completed
			}
			item.LastRun = &run
		} else if !errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusInternalServerError, "batch history read failed")
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *app) runAdminBatch(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	batchKey := strings.TrimSpace(r.PathValue("batchKey"))
	if _, ok := managedBatchDefinitionFor(batchKey); !ok {
		writeError(w, http.StatusNotFound, "batch not found")
		return
	}
	result, err := a.runManagedBatch(r.Context(), batchKey, "MANUAL", &user.ID)
	if err != nil {
		var cooldownErr *managedBatchCooldownError
		if errors.As(err, &cooldownErr) {
			writeError(w, http.StatusTooManyRequests, cooldownErr.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "batch execution failed")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

type managedBatchCooldownError struct {
	remaining time.Duration
}

func (e *managedBatchCooldownError) Error() string {
	minutes := int((e.remaining + time.Minute - 1) / time.Minute)
	if minutes < 1 {
		minutes = 1
	}
	return fmt.Sprintf("이 배치는 수동 실행 후 20분 간격으로만 실행할 수 있습니다. 약 %d분 후 다시 실행해주세요.", minutes)
}

func (a *app) startManagedBatchRun(ctx context.Context, definition managedBatchDefinition, triggerType string, requestedByUserID *int64) (int64, time.Time, error) {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return 0, time.Time{}, err
	}
	defer tx.Rollback(ctx)
	if triggerType == "MANUAL" {
		if _, err := tx.Exec(ctx, "select pg_advisory_xact_lock(hashtext($1))", definition.Key); err != nil {
			return 0, time.Time{}, err
		}
		var lastManualRun time.Time
		err := tx.QueryRow(ctx, `
			select started_at
			from batch_run_histories
			where batch_key = $1 and trigger_type = 'MANUAL'
			order by id desc
			limit 1
		`, definition.Key).Scan(&lastManualRun)
		if err == nil {
			remaining := managedBatchManualCooldown - time.Since(lastManualRun)
			if remaining > 0 {
				return 0, time.Time{}, &managedBatchCooldownError{remaining: remaining}
			}
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return 0, time.Time{}, err
		}
	}

	startedAt := time.Now()
	var requestedBy any
	if requestedByUserID != nil {
		requestedBy = *requestedByUserID
	}
	var runID int64
	if err := tx.QueryRow(ctx, `
		insert into batch_run_histories (batch_key, trigger_type, requested_by_user_id, started_at, status)
		values ($1, $2, $3, $4, 'RUNNING')
		returning id
	`, definition.Key, triggerType, requestedBy, startedAt).Scan(&runID); err != nil {
		return 0, time.Time{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, time.Time{}, err
	}
	return runID, startedAt, nil
}

func (a *app) runManagedBatch(ctx context.Context, batchKey string, triggerType string, requestedByUserID *int64) (managedBatchRun, error) {
	definition, ok := managedBatchDefinitionFor(batchKey)
	if !ok {
		return managedBatchRun{}, fmt.Errorf("unknown batch: %s", batchKey)
	}
	runID, startedAt, err := a.startManagedBatchRun(ctx, definition, triggerType, requestedByUserID)
	if err != nil {
		return managedBatchRun{}, err
	}

	result := managedBatchRun{StartedAt: startedAt, Status: "COMPLETED"}
	switch batchKey {
	case "schedule-morning-push":
		count, err := a.dispatchMorningSchedulePushes(ctx, time.Now().In(koreanLocation()))
		if err != nil {
			return a.finishManagedBatchRun(ctx, runID, result, err)
		}
		result.ProcessedCount = count
		result.Message = "오전 일정 알림 발송을 처리했습니다."
	case "schedule-time-push":
		count, err := a.dispatchScheduleTimePushes(ctx, time.Now().In(koreanLocation()))
		if err != nil {
			return a.finishManagedBatchRun(ctx, runID, result, err)
		}
		result.ProcessedCount = count
		result.Message = "현재 시각 일정 알림 발송을 처리했습니다."
	case "holiday-sync":
		syncResult, err := a.syncHolidayYears(ctx, holidaySyncYears(time.Now(), a.cfg.holidaySyncYearsBefore, a.cfg.holidaySyncYearsAfter))
		if err != nil {
			return a.finishManagedBatchRun(ctx, runID, result, err)
		}
		result.ProcessedCount = int64(syncResult.Upserted)
		result.Message = syncResult.Message
		if syncResult.Skipped {
			result.Status = "SKIPPED"
		}
	case "withdrawn-account-purge":
		count, err := a.purgeWithdrawnAccounts(ctx)
		if err != nil {
			return a.finishManagedBatchRun(ctx, runID, result, err)
		}
		result.ProcessedCount = count
		result.Message = "탈퇴 후 1년이 지난 계정을 정리했습니다."
	case "history-purge":
		count, err := a.purgeActivityHistories(ctx)
		if err != nil {
			return a.finishManagedBatchRun(ctx, runID, result, err)
		}
		result.ProcessedCount = count
		result.Message = "1년이 지난 이력 데이터를 정리했습니다."
	case "unverified-account-purge":
		count, err := a.purgeExpiredUnverifiedAccounts(ctx)
		if err != nil {
			return a.finishManagedBatchRun(ctx, runID, result, err)
		}
		result.ProcessedCount = count
		result.Message = "인증이 만료된 미가입 계정을 정리했습니다."
	case "database-backup":
		if err := a.queueDatabaseBackup(runID); err != nil {
			return a.finishManagedBatchRun(ctx, runID, result, err)
		}
		result.Status = "RUNNING"
		result.Message = "외부 저장소 데이터베이스 백업을 요청했습니다. 최대 20초 안에 시작됩니다."
		return result, nil
	case "community-hotdeal-refresh":
		response := a.communityHotDealSnapshot(ctx, true)
		result.ProcessedCount = int64(len(response.Items))
		result.Message = "특가 출처를 다시 수집했습니다."
	default:
		return a.finishManagedBatchRun(ctx, runID, result, fmt.Errorf("batch handler is not configured: %s", batchKey))
	}
	return a.finishManagedBatchRun(ctx, runID, result, nil)
}

func (a *app) queueDatabaseBackup(runID int64) error {
	controlPath := strings.TrimSpace(a.cfg.databaseBackupControlPath)
	if controlPath == "" {
		return errors.New("database backup manual execution is not configured")
	}
	if err := os.MkdirAll(controlPath, 0o750); err != nil {
		return fmt.Errorf("database backup control directory: %w", err)
	}
	payload, err := json.Marshal(map[string]int64{"runId": runID})
	if err != nil {
		return err
	}
	requestPath := filepath.Join(controlPath, fmt.Sprintf("request-%d.json", runID))
	temporaryPath := requestPath + ".tmp"
	if err := os.WriteFile(temporaryPath, payload, 0o640); err != nil {
		return fmt.Errorf("database backup request write: %w", err)
	}
	if err := os.Rename(temporaryPath, requestPath); err != nil {
		return fmt.Errorf("database backup request queue: %w", err)
	}
	return nil
}

func (a *app) finishManagedBatchRun(ctx context.Context, runID int64, result managedBatchRun, runErr error) (managedBatchRun, error) {
	completedAt := time.Now()
	result.CompletedAt = &completedAt
	if runErr != nil {
		result.Status = "FAILED"
		result.Message = runErr.Error()
	}
	if _, err := a.db.Exec(ctx, `
		update batch_run_histories
		set completed_at = $2, status = $3, processed_count = $4, message = $5
		where id = $1
	`, runID, completedAt, result.Status, result.ProcessedCount, result.Message); err != nil {
		return result, err
	}
	if runErr != nil {
		return result, runErr
	}
	return result, nil
}

func (a *app) changePassword(w http.ResponseWriter, r *http.Request, user authUser) {
	var req struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if !validPasswordLength(req.NewPassword) {
		writeError(w, http.StatusBadRequest, "new password length 8-128 bytes is required")
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
		reason := "provider authorization failed: " + errMessage
		if description := strings.TrimSpace(r.URL.Query().Get("error_description")); description != "" {
			reason += " (" + truncateRunes(description, 240) + ")"
		}
		a.log.Warn("oauth provider authorization failed", "provider", providerName, "reason", reason)
		a.recordLoginHistory(r.Context(), nil, "", providerName, "SSO_LOGIN", "FAIL", reason)
		writeOAuthCallbackHTML(w, http.StatusBadRequest, a.cfg.publicBaseURL, "", nil, oauthCallbackErrorMessage(providerName, errMessage))
		return
	}
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	state := strings.TrimSpace(r.URL.Query().Get("state"))
	if code == "" || state == "" {
		a.recordLoginHistory(r.Context(), nil, "", providerName, "SSO_LOGIN", "FAIL", "missing oauth code or state")
		writeOAuthCallbackHTML(w, http.StatusBadRequest, a.cfg.publicBaseURL, "", nil, "로그인 응답이 올바르지 않습니다. 처음부터 다시 시도해 주세요.")
		return
	}
	if !a.consumeOAuthState(r.Context(), providerName, state) {
		a.recordLoginHistory(r.Context(), nil, "", providerName, "SSO_LOGIN", "FAIL", "invalid or expired oauth state")
		writeOAuthCallbackHTML(w, http.StatusBadRequest, a.cfg.publicBaseURL, "", nil, "로그인 시간이 만료되었거나 요청이 올바르지 않습니다. 다시 시도해 주세요.")
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
	if errors.Is(err, errAccountSuspended) {
		writeOAuthCallbackHTML(w, http.StatusForbidden, a.cfg.publicBaseURL, "", nil, "account suspended")
		return
	}
	if err != nil {
		a.log.Error("oauth login failed", "provider", providerName, "error", err)
		a.recordLoginHistory(r.Context(), nil, profile.Email, providerName, "SSO_LOGIN", "FAIL", "oauth login failed")
		writeOAuthCallbackHTML(w, http.StatusInternalServerError, a.cfg.publicBaseURL, "", nil, "oauth login failed")
		return
	}
	a.recordLoginHistory(r.Context(), &response.UserID, firstNonEmpty(response.LoginEmail, response.Email), providerName, "SSO_LOGIN", "SUCCESS", "")
	userPayload := map[string]any{
		"userId":        response.UserID,
		"email":         response.Email,
		"loginEmail":    response.LoginEmail,
		"nickname":      response.Nickname,
		"platformAdmin": response.PlatformAdmin,
		"provider":      response.Provider,
	}
	writeOAuthCallbackHTML(w, http.StatusOK, a.cfg.publicBaseURL, response.AccessToken, userPayload, "")
}

func oauthCallbackErrorMessage(providerName, providerError string) string {
	switch strings.ToLower(strings.TrimSpace(providerError)) {
	case "access_denied", "user_cancelled", "user_canceled":
		return "로그인이 취소되었습니다. 다시 시도해 주세요."
	case "invalid_scope", "insufficient_scope":
		return "필수 동의 항목을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요."
	case "redirect_uri_mismatch", "invalid_redirect_uri":
		return "로그인 연결 주소 설정에 문제가 있습니다. 관리자에게 문의해 주세요."
	default:
		return "소셜 로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."
	}
}

func truncateRunes(value string, limit int) string {
	value = strings.TrimSpace(value)
	if limit <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit]) + "…"
}

func (a *app) verifyEmail(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		writeEmailVerificationHTML(w, http.StatusBadRequest, a.cfg.publicBaseURL, false, "인증 링크가 올바르지 않습니다.")
		return
	}
	tokenHash := verificationTokenHash(token)
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeEmailVerificationHTML(w, http.StatusInternalServerError, a.cfg.publicBaseURL, false, "인증 처리 중 문제가 발생했습니다.")
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
		writeEmailVerificationHTML(w, http.StatusBadRequest, a.cfg.publicBaseURL, false, "인증 링크가 만료되었거나 이미 사용되었습니다.")
		return
	}
	if _, err := tx.Exec(r.Context(), `
		update app_users
		set email_verified_at = now(), email_verification_required = false
		where id = $1
	`, userID); err != nil {
		writeEmailVerificationHTML(w, http.StatusInternalServerError, a.cfg.publicBaseURL, false, "이메일 인증을 완료하지 못했습니다.")
		return
	}
	if _, err := tx.Exec(r.Context(), "update email_verification_tokens set used_at = now() where id = $1", tokenID); err != nil {
		writeEmailVerificationHTML(w, http.StatusInternalServerError, a.cfg.publicBaseURL, false, "이메일 인증을 완료하지 못했습니다.")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeEmailVerificationHTML(w, http.StatusInternalServerError, a.cfg.publicBaseURL, false, "이메일 인증을 완료하지 못했습니다.")
		return
	}
	a.recordLoginHistory(r.Context(), &userID, email, "password", "EMAIL_VERIFY", "SUCCESS", "")
	writeEmailVerificationHTML(w, http.StatusOK, a.cfg.publicBaseURL, true, "이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다.")
}

func (a *app) resendVerificationEmail(w http.ResponseWriter, r *http.Request) {
	if !a.allowRequest("auth:verify-resend:"+clientIP(r), 5, 10*time.Minute) {
		writeError(w, http.StatusTooManyRequests, "too many requests")
		return
	}
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
		where email = $1 and deleted_at is null
	`, email).Scan(&userID, &nickname, &verifiedAt, &required)
	if err == nil && required && !verifiedAt.Valid {
		var remainingResends int
		err = a.db.QueryRow(r.Context(), `
			update app_users
			set email_verification_resend_count = coalesce(email_verification_resend_count, 0) + 1
			where id = $1
			  and email_verification_required = true
			  and email_verified_at is null
			  and coalesce(email_verification_resend_count, 0) < $2
			returning $2 - email_verification_resend_count
		`, userID, maxEmailVerificationResends).Scan(&remainingResends)
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{
				"message":          "verification email resend limit reached",
				"remainingResends": 0,
			})
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "verification resend limit check failed")
			return
		}
		if sendErr := a.createAndSendEmailVerification(r.Context(), userID, email, nickname); sendErr != nil {
			a.log.Error("email verification resend failed", "email", email, "error", sendErr)
		}
		writeJSON(w, http.StatusAccepted, map[string]any{
			"message":          "verification email accepted",
			"remainingResends": remainingResends,
		})
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"message": "verification email accepted"})
}

func (a *app) findEmail(w http.ResponseWriter, r *http.Request) {
	if !a.allowRequest("auth:find-email:"+clientIP(r), 10, 10*time.Minute) {
		writeError(w, http.StatusTooManyRequests, "too many requests")
		return
	}
	var req struct {
		Nickname string `json:"nickname"`
	}
	type foundAccount struct {
		Email         string `json:"email"`
		LoginProvider string `json:"loginProvider"`
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
		select email,
		       coalesce(provider, case when login_id is not null and login_id <> '' then 'admin' else 'password' end)
		from app_users
		where deleted_at is null and lower(nickname) = lower($1)
		order by created_at desc
		limit 5
	`, nickname)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	emails := []string{}
	accounts := []foundAccount{}
	for rows.Next() {
		var email string
		var provider string
		if err := rows.Scan(&email, &provider); err != nil {
			writeError(w, http.StatusInternalServerError, "database read failed")
			return
		}
		maskedEmail := maskEmail(email)
		emails = append(emails, maskedEmail)
		accounts = append(accounts, foundAccount{
			Email:         maskedEmail,
			LoginProvider: strings.ToLower(strings.TrimSpace(provider)),
		})
	}
	if rows.Err() != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"emails": emails, "accounts": accounts})
}

func (a *app) requestPasswordReset(w http.ResponseWriter, r *http.Request) {
	if !a.allowRequest("auth:password-request:"+clientIP(r), 5, 10*time.Minute) {
		writeError(w, http.StatusTooManyRequests, "too many requests")
		return
	}
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
	err := a.db.QueryRow(r.Context(), "select id, nickname from app_users where email = $1 and deleted_at is null", email).Scan(&userID, &nickname)
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
	if !a.allowRequest("auth:password-reset:"+clientIP(r), 10, 10*time.Minute) {
		writeError(w, http.StatusTooManyRequests, "too many requests")
		return
	}
	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	token := strings.TrimSpace(req.Token)
	if token == "" || !validPasswordLength(req.Password) {
		writeError(w, http.StatusBadRequest, "token and password length 8-128 bytes are required")
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
		    active_session_expires_at = null,
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
	if !a.allowRequest("auth:recovery-inquiry:"+clientIP(r), 5, 10*time.Minute) {
		writeError(w, http.StatusTooManyRequests, "too many requests")
		return
	}
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

type accountRecoveryInquiryItem struct {
	ID              int64      `json:"id"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       *time.Time `json:"updatedAt,omitempty"`
	Email           string     `json:"email"`
	Nickname        string     `json:"nickname"`
	Contact         string     `json:"contact"`
	RecoveryType    string     `json:"recoveryType"`
	Message         string     `json:"message"`
	Status          string     `json:"status"`
	ReplyMessage    string     `json:"replyMessage,omitempty"`
	RepliedAt       *time.Time `json:"repliedAt,omitempty"`
	RepliedByUserID *int64     `json:"repliedByUserId,omitempty"`
}

func scanAccountRecoveryInquiry(row pgx.Row) (accountRecoveryInquiryItem, error) {
	var item accountRecoveryInquiryItem
	var updatedAt sql.NullTime
	var repliedAt sql.NullTime
	var repliedByUserID sql.NullInt64
	err := row.Scan(
		&item.ID,
		&item.CreatedAt,
		&updatedAt,
		&item.Email,
		&item.Nickname,
		&item.Contact,
		&item.RecoveryType,
		&item.Message,
		&item.Status,
		&item.ReplyMessage,
		&repliedAt,
		&repliedByUserID,
	)
	if err != nil {
		return item, err
	}
	if updatedAt.Valid {
		value := updatedAt.Time
		item.UpdatedAt = &value
	}
	if repliedAt.Valid {
		value := repliedAt.Time
		item.RepliedAt = &value
	}
	if repliedByUserID.Valid {
		value := repliedByUserID.Int64
		item.RepliedByUserID = &value
	}
	return item, nil
}

const accountRecoveryInquirySelect = `
	select id, created_at, updated_at, coalesce(email, ''), coalesce(nickname, ''), coalesce(contact, ''),
		coalesce(recovery_type, ''), coalesce(message, ''), status, coalesce(reply_message, ''),
		replied_at, replied_by_user_id
	from account_recovery_inquiries
`

func validAccountInquiryStatus(status string) bool {
	switch status {
	case "OPEN", "IN_PROGRESS", "REPLIED", "CLOSED":
		return true
	default:
		return false
	}
}

func (a *app) listAccountRecoveryInquiries(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	status := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("status")))
	if status == "" {
		status = "OPEN"
	}
	if status != "ALL" && !validAccountInquiryStatus(status) {
		writeError(w, http.StatusBadRequest, "invalid inquiry status")
		return
	}
	limit := 50
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 100 {
			writeError(w, http.StatusBadRequest, "invalid limit")
			return
		}
		limit = value
	}
	query := accountRecoveryInquirySelect
	args := []any{}
	if status != "ALL" {
		query += " where status = $1"
		args = append(args, status)
	}
	args = append(args, limit)
	query += fmt.Sprintf(" order by created_at desc, id desc limit $%d", len(args))
	rows, err := a.db.Query(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items := []accountRecoveryInquiryItem{}
	for rows.Next() {
		item, err := scanAccountRecoveryInquiry(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *app) updateAccountRecoveryInquiry(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	inquiryID, ok := pathID(w, r, "inquiryId")
	if !ok {
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	status := strings.ToUpper(strings.TrimSpace(req.Status))
	if !validAccountInquiryStatus(status) {
		writeError(w, http.StatusBadRequest, "invalid inquiry status")
		return
	}
	item, err := scanAccountRecoveryInquiry(a.db.QueryRow(r.Context(), accountRecoveryInquirySelect+`
		where id = $1
	`, inquiryID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "inquiry not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	updated, err := scanAccountRecoveryInquiry(a.db.QueryRow(r.Context(), `
		with updated as (
			update account_recovery_inquiries
			set status = $2, updated_at = now()
			where id = $1
			returning id
		)
	`+accountRecoveryInquirySelect+`
		where id = (select id from updated)
	`, item.ID, status))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database update failed")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *app) replyAccountRecoveryInquiry(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	inquiryID, ok := pathID(w, r, "inquiryId")
	if !ok {
		return
	}
	var req struct {
		Message string `json:"message"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	replyMessage := strings.TrimSpace(req.Message)
	if replyMessage == "" {
		writeError(w, http.StatusBadRequest, "reply message is required")
		return
	}
	if len(replyMessage) > 4000 {
		writeError(w, http.StatusBadRequest, "reply message is too long")
		return
	}
	item, err := scanAccountRecoveryInquiry(a.db.QueryRow(r.Context(), accountRecoveryInquirySelect+`
		where id = $1
	`, inquiryID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "inquiry not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	recipient := normalizeEmail(item.Email)
	if recipient == "" && strings.Contains(item.Contact, "@") {
		recipient = normalizeEmail(item.Contact)
	}
	if recipient == "" {
		writeError(w, http.StatusBadRequest, "reply email is required")
		return
	}
	if err := a.sendAccountRecoveryReplyEmail(recipient, item, replyMessage); err != nil {
		a.log.Error("account recovery reply mail failed", "inquiryId", inquiryID, "error", err)
		writeError(w, http.StatusServiceUnavailable, "mail delivery failed")
		return
	}
	updated, err := scanAccountRecoveryInquiry(a.db.QueryRow(r.Context(), `
		with updated as (
			update account_recovery_inquiries
			set status = 'REPLIED', reply_message = $2, replied_at = now(), updated_at = now(), replied_by_user_id = $3
			where id = $1
			returning id
		)
	`+accountRecoveryInquirySelect+`
		where id = (select id from updated)
	`, inquiryID, replyMessage, user.ID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database update failed")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

type moderationWarningItem struct {
	ID          int64   `json:"id"`
	Reason      string  `json:"reason"`
	SourceType  string  `json:"sourceType"`
	SourceID    *int64  `json:"sourceId,omitempty"`
	IssuerName  string  `json:"issuerName"`
	CreatedAt   string  `json:"createdAt"`
	Cancelled   bool    `json:"cancelled"`
	CancelledAt *string `json:"cancelledAt,omitempty"`
}

type moderationUserItem struct {
	ID                     int64                   `json:"id"`
	Email                  string                  `json:"email"`
	LoginID                string                  `json:"loginId"`
	Nickname               string                  `json:"nickname"`
	WarningCount           int64                   `json:"warningCount"`
	Suspended              bool                    `json:"suspended"`
	SuspendedAt            *string                 `json:"suspendedAt,omitempty"`
	SuspensionReason       string                  `json:"suspensionReason,omitempty"`
	MediaStorageBytes      int64                   `json:"mediaStorageBytes"`
	MediaStorageUnlimited  bool                    `json:"mediaStorageUnlimited"`
	MediaFileSizeUnlimited bool                    `json:"mediaFileSizeUnlimited"`
	Warnings               []moderationWarningItem `json:"warnings"`
}

type moderationWarningPage struct {
	Items    []moderationWarningItem `json:"items"`
	Total    int                     `json:"total"`
	Page     int                     `json:"page"`
	PageSize int                     `json:"pageSize"`
}

func (a *app) moderationWarningsForUser(ctx context.Context, userID int64) ([]moderationWarningItem, error) {
	rows, err := a.db.Query(ctx, `
		select w.id, w.reason, w.source_type, w.source_id,
		       coalesce(nullif(issuer.nickname, ''), nullif(issuer.email, ''), nullif(issuer.login_id, ''), '관리자'),
		       w.created_at, w.cancelled_at
		from user_moderation_warnings w
		left join app_users issuer on issuer.id = w.issued_by_user_id
		where w.user_id = $1
		order by w.created_at desc, w.id desc
		limit 20
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []moderationWarningItem{}
	for rows.Next() {
		var item moderationWarningItem
		var sourceID sql.NullInt64
		var createdAt time.Time
		var cancelledAt sql.NullTime
		if err := rows.Scan(&item.ID, &item.Reason, &item.SourceType, &sourceID, &item.IssuerName, &createdAt, &cancelledAt); err != nil {
			return nil, err
		}
		item.SourceID = nullInt64(sourceID)
		item.CreatedAt = formatTime(createdAt)
		if cancelledAt.Valid {
			item.Cancelled = true
			formatted := formatTime(cancelledAt.Time)
			item.CancelledAt = &formatted
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (a *app) listModerationWarnings(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	userID, ok := pathID(w, r, "userId")
	if !ok {
		return
	}
	page, pageSize := moderationPagination(r)
	var total int
	if err := a.db.QueryRow(r.Context(), `
		select count(*) from user_moderation_warnings w
		join app_users u on u.id = w.user_id
		where w.user_id = $1 and u.deleted_at is null and u.platform_admin = false
	`, userID).Scan(&total); err != nil {
		writeError(w, http.StatusInternalServerError, "moderation warnings read failed")
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select w.id, w.reason, w.source_type, w.source_id,
		       coalesce(nullif(issuer.nickname, ''), nullif(issuer.email, ''), nullif(issuer.login_id, ''), '관리자'),
		       w.created_at, w.cancelled_at
		from user_moderation_warnings w
		left join app_users issuer on issuer.id = w.issued_by_user_id
		where w.user_id = $1
		order by w.created_at desc, w.id desc
		limit $2 offset $3
	`, userID, pageSize, (page-1)*pageSize)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "moderation warnings read failed")
		return
	}
	defer rows.Close()
	items := []moderationWarningItem{}
	for rows.Next() {
		var item moderationWarningItem
		var sourceID sql.NullInt64
		var createdAt time.Time
		var cancelledAt sql.NullTime
		if err := rows.Scan(&item.ID, &item.Reason, &item.SourceType, &sourceID, &item.IssuerName, &createdAt, &cancelledAt); err != nil {
			writeError(w, http.StatusInternalServerError, "moderation warnings scan failed")
			return
		}
		item.SourceID = nullInt64(sourceID)
		item.CreatedAt = formatTime(createdAt)
		if cancelledAt.Valid {
			item.Cancelled = true
			formatted := formatTime(cancelledAt.Time)
			item.CancelledAt = &formatted
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "moderation warnings read failed")
		return
	}
	writeJSON(w, http.StatusOK, moderationWarningPage{Items: items, Total: total, Page: page, PageSize: pageSize})
}

func (a *app) moderationUserByID(ctx context.Context, userID int64) (moderationUserItem, error) {
	var item moderationUserItem
	var suspendedAt sql.NullTime
	err := a.db.QueryRow(ctx, `
		select u.id, coalesce(u.email, ''), coalesce(u.login_id, ''), coalesce(u.nickname, ''),
		       count(w.id), u.moderation_suspended_at, coalesce(u.moderation_reason, ''),
		       media.bytes_used, u.media_storage_unlimited, u.media_file_size_unlimited
		from app_users u
		left join user_moderation_warnings w on w.user_id = u.id and w.cancelled_at is null
		left join lateral (select coalesce(sum(byte_size), 0) as bytes_used from media_files where uploaded_by_user_id = u.id and deleted_at is null) media on true
		where u.id = $1 and u.deleted_at is null and u.platform_admin = false
		group by u.id, media.bytes_used
	`, userID).Scan(&item.ID, &item.Email, &item.LoginID, &item.Nickname, &item.WarningCount, &suspendedAt, &item.SuspensionReason, &item.MediaStorageBytes, &item.MediaStorageUnlimited, &item.MediaFileSizeUnlimited)
	if err != nil {
		return moderationUserItem{}, err
	}
	if suspendedAt.Valid {
		item.Suspended = true
		formatted := formatTime(suspendedAt.Time)
		item.SuspendedAt = &formatted
	}
	item.Warnings, err = a.moderationWarningsForUser(ctx, item.ID)
	return item, err
}

func moderationPagination(r *http.Request) (int, int) {
	page := 1
	pageSize := 10
	if value, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("page"))); err == nil && value > 0 {
		page = value
	}
	if value, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("pageSize"))); err == nil {
		switch value {
		case 10, 20, 30, 50:
			pageSize = value
		}
	}
	return page, pageSize
}

func (a *app) listModerationUsers(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	queryText := strings.TrimSpace(r.URL.Query().Get("query"))
	search := "%" + strings.ToLower(queryText) + "%"
	page, pageSize := moderationPagination(r)
	var total int
	if err := a.db.QueryRow(r.Context(), `
		-- The dashboard "visitors" metric is the number of people who
		-- logged in during the selected period.  The detail dialog remains
		-- an audit trail and deliberately keeps every login event.
		select count(distinct l.user_id)
		from app_users u
		where u.deleted_at is null
		  and u.platform_admin = false
		  and ($1 = '%' or lower(coalesce(u.email, '')) like $1 or lower(coalesce(u.login_id, '')) like $1 or lower(coalesce(u.nickname, '')) like $1)
	`, search).Scan(&total); err != nil {
		writeError(w, http.StatusInternalServerError, "moderation users read failed")
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select u.id, coalesce(u.email, ''), coalesce(u.login_id, ''), coalesce(u.nickname, ''),
		       count(w.id), u.moderation_suspended_at, coalesce(u.moderation_reason, ''),
		       media.bytes_used, u.media_storage_unlimited, u.media_file_size_unlimited
		from app_users u
		left join user_moderation_warnings w on w.user_id = u.id and w.cancelled_at is null
		left join lateral (select coalesce(sum(byte_size), 0) as bytes_used from media_files where uploaded_by_user_id = u.id and deleted_at is null) media on true
		where u.deleted_at is null
		  and u.platform_admin = false
		  and ($1 = '%' or lower(coalesce(u.email, '')) like $1 or lower(coalesce(u.login_id, '')) like $1 or lower(coalesce(u.nickname, '')) like $1)
		group by u.id, media.bytes_used
		order by (u.moderation_suspended_at is not null) desc, count(w.id) desc, u.created_at desc, u.id desc
		limit $2 offset $3
	`, search, pageSize, (page-1)*pageSize)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "moderation users read failed")
		return
	}
	defer rows.Close()
	items := []moderationUserItem{}
	for rows.Next() {
		var item moderationUserItem
		var suspendedAt sql.NullTime
		if err := rows.Scan(&item.ID, &item.Email, &item.LoginID, &item.Nickname, &item.WarningCount, &suspendedAt, &item.SuspensionReason, &item.MediaStorageBytes, &item.MediaStorageUnlimited, &item.MediaFileSizeUnlimited); err != nil {
			writeError(w, http.StatusInternalServerError, "moderation users scan failed")
			return
		}
		if suspendedAt.Valid {
			item.Suspended = true
			formatted := formatTime(suspendedAt.Time)
			item.SuspendedAt = &formatted
		}
		item.Warnings = []moderationWarningItem{}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "moderation users read failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":    items,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (a *app) issueModerationWarning(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	var req struct {
		UserID     int64  `json:"userId"`
		Reason     string `json:"reason"`
		SourceType string `json:"sourceType"`
		SourceID   *int64 `json:"sourceId"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.UserID <= 0 || req.Reason == "" {
		writeError(w, http.StatusBadRequest, "user and warning reason are required")
		return
	}
	if utf8.RuneCountInString(req.Reason) > 500 {
		writeError(w, http.StatusBadRequest, "warning reason is too long")
		return
	}
	sourceType := strings.ToUpper(strings.TrimSpace(req.SourceType))
	if sourceType == "" {
		sourceType = "MANUAL"
	}
	if len(sourceType) > 64 {
		writeError(w, http.StatusBadRequest, "warning source is invalid")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "moderation transaction failed")
		return
	}
	defer tx.Rollback(r.Context())
	var platformAdmin bool
	if err := tx.QueryRow(r.Context(), "select platform_admin from app_users where id = $1 and deleted_at is null for update", req.UserID).Scan(&platformAdmin); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "moderation user read failed")
		return
	}
	if platformAdmin {
		writeError(w, http.StatusForbidden, "platform admin cannot be moderated")
		return
	}
	var sourceID any
	if req.SourceID != nil && *req.SourceID > 0 {
		sourceID = *req.SourceID
	}
	if _, err := tx.Exec(r.Context(), `
		insert into user_moderation_warnings (user_id, issued_by_user_id, reason, source_type, source_id, created_at)
		values ($1, $2, $3, $4, $5, now())
	`, req.UserID, user.ID, req.Reason, sourceType, sourceID); err != nil {
		writeError(w, http.StatusInternalServerError, "warning save failed")
		return
	}
	var warningCount int64
	if err := tx.QueryRow(r.Context(), "select count(*) from user_moderation_warnings where user_id = $1 and cancelled_at is null", req.UserID).Scan(&warningCount); err != nil {
		writeError(w, http.StatusInternalServerError, "warning count failed")
		return
	}
	if warningCount >= 3 {
		if _, err := tx.Exec(r.Context(), `
			update app_users
			set moderation_suspended_at = now(), moderation_reason = $2,
			    active_session_id = null, active_session_expires_at = null
			where id = $1
		`, req.UserID, "커뮤니티 경고 3회 누적: "+req.Reason); err != nil {
			writeError(w, http.StatusInternalServerError, "account suspension failed")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "moderation save failed")
		return
	}
	item, err := a.moderationUserByID(r.Context(), req.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "moderation user read failed")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) cancelModerationWarning(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	warningID, ok := pathID(w, r, "warningId")
	if !ok {
		return
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "moderation transaction failed")
		return
	}
	defer tx.Rollback(r.Context())
	var userID int64
	err = tx.QueryRow(r.Context(), `
		select user_id from user_moderation_warnings
		where id = $1 and cancelled_at is null
		for update
	`, warningID).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "active warning not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "warning read failed")
		return
	}
	if _, err := tx.Exec(r.Context(), `
		update user_moderation_warnings
		set cancelled_at = now(), cancelled_by_user_id = $2
		where id = $1
	`, warningID, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "warning cancel failed")
		return
	}
	var warningCount int64
	if err := tx.QueryRow(r.Context(), "select count(*) from user_moderation_warnings where user_id = $1 and cancelled_at is null", userID).Scan(&warningCount); err != nil {
		writeError(w, http.StatusInternalServerError, "warning count failed")
		return
	}
	if warningCount < 3 {
		if _, err := tx.Exec(r.Context(), `
			update app_users
			set moderation_suspended_at = null, moderation_reason = null,
			    active_session_id = null, active_session_expires_at = null
			where id = $1
		`, userID); err != nil {
			writeError(w, http.StatusInternalServerError, "account release failed")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "warning cancel failed")
		return
	}
	item, err := a.moderationUserByID(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "moderation user read failed")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *app) releaseModerationUser(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	userID, ok := pathID(w, r, "userId")
	if !ok {
		return
	}
	var platformAdmin bool
	err := a.db.QueryRow(r.Context(), "select platform_admin from app_users where id = $1 and deleted_at is null", userID).Scan(&platformAdmin)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "moderation user read failed")
		return
	}
	if platformAdmin {
		writeError(w, http.StatusForbidden, "platform admin cannot be moderated")
		return
	}
	if _, err := a.db.Exec(r.Context(), `
		update app_users
		set moderation_suspended_at = null, moderation_reason = null,
		    active_session_id = null, active_session_expires_at = null
		where id = $1
	`, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "account release failed")
		return
	}
	item, err := a.moderationUserByID(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "moderation user read failed")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *app) updateMediaStorageUnlimited(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	userID, ok := pathID(w, r, "userId")
	if !ok {
		return
	}
	var req struct {
		Unlimited bool `json:"unlimited"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	var platformAdmin bool
	if err := a.db.QueryRow(r.Context(), "select platform_admin from app_users where id = $1 and deleted_at is null", userID).Scan(&platformAdmin); errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "media storage user read failed")
		return
	}
	if platformAdmin {
		writeError(w, http.StatusForbidden, "platform admin storage is always unlimited")
		return
	}
	if _, err := a.db.Exec(r.Context(), "update app_users set media_storage_unlimited = $2 where id = $1", userID, req.Unlimited); err != nil {
		writeError(w, http.StatusInternalServerError, "media storage policy save failed")
		return
	}
	item, err := a.moderationUserByID(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "media storage user read failed")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *app) updateMediaFileSizeUnlimited(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	userID, ok := pathID(w, r, "userId")
	if !ok {
		return
	}
	var req struct {
		Unlimited bool `json:"unlimited"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	var platformAdmin bool
	if err := a.db.QueryRow(r.Context(), "select platform_admin from app_users where id = $1 and deleted_at is null", userID).Scan(&platformAdmin); errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "media file policy user read failed")
		return
	}
	if platformAdmin {
		writeError(w, http.StatusForbidden, "platform admin file size is always unlimited")
		return
	}
	if _, err := a.db.Exec(r.Context(), "update app_users set media_file_size_unlimited = $2 where id = $1", userID, req.Unlimited); err != nil {
		writeError(w, http.StatusInternalServerError, "media file policy save failed")
		return
	}
	item, err := a.moderationUserByID(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "media file policy user read failed")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *app) listFamilies(w http.ResponseWriter, r *http.Request, user authUser) {
	query := `
		select f.id, f.created_at, f.name,
		       (own.user_id is not null) as is_member,
		       coalesce(own.role, ''),
		       coalesce(own.can_read, false),
		       coalesce(own.can_create, false),
		       coalesce(own.can_update, false),
		       coalesce(own.can_delete, false)
		from family_groups f
		left join family_members own on own.family_id = f.id and own.user_id = $1
		where own.can_read = true
		order by own.joined_at asc nulls last,
		         f.created_at asc
	`
	rows, err := a.db.Query(r.Context(), query, user.ID)
	if err != nil {
		a.log.Error("family list query failed", "userId", user.ID, "error", err)
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	type family struct {
		ID        int64     `json:"id"`
		CreatedAt time.Time `json:"createdAt"`
		Name      string    `json:"name"`
		IsMember  bool      `json:"isMember"`
		Role      string    `json:"role,omitempty"`
		CanRead   bool      `json:"canRead"`
		CanCreate bool      `json:"canCreate"`
		CanUpdate bool      `json:"canUpdate"`
		CanDelete bool      `json:"canDelete"`
	}
	families := []family{}
	for rows.Next() {
		var item family
		if err := rows.Scan(
			&item.ID,
			&item.CreatedAt,
			&item.Name,
			&item.IsMember,
			&item.Role,
			&item.CanRead,
			&item.CanCreate,
			&item.CanUpdate,
			&item.CanDelete,
		); err != nil {
			a.log.Error("family list scan failed", "userId", user.ID, "error", err)
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return
		}
		families = append(families, item)
	}
	if err := rows.Err(); err != nil {
		a.log.Error("family list iteration failed", "userId", user.ID, "error", err)
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	a.log.Info("family list resolved", "userId", user.ID, "count", len(families))
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
		name = nickname + " 그룹"
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
	ID             int64    `json:"id"`
	FamilyID       int64    `json:"familyId"`
	UserID         int64    `json:"userId"`
	Email          string   `json:"email,omitempty"`
	Nickname       string   `json:"nickname,omitempty"`
	Role           string   `json:"role"`
	CanRead        bool     `json:"canRead"`
	CanCreate      bool     `json:"canCreate"`
	CanUpdate      bool     `json:"canUpdate"`
	CanDelete      bool     `json:"canDelete"`
	SharedMenuKeys []string `json:"sharedMenuKeys"`
	JoinedAt       string   `json:"joinedAt"`
}

type familyInvitation struct {
	ID             int64    `json:"id"`
	FamilyID       int64    `json:"familyId"`
	FamilyName     string   `json:"familyName"`
	InviterUserID  int64    `json:"inviterUserId"`
	InviterName    string   `json:"inviterName,omitempty"`
	InviteeUserID  int64    `json:"inviteeUserId"`
	InviteeEmail   string   `json:"inviteeEmail,omitempty"`
	InviteeName    string   `json:"inviteeName,omitempty"`
	Role           string   `json:"role"`
	CanRead        bool     `json:"canRead"`
	CanCreate      bool     `json:"canCreate"`
	CanUpdate      bool     `json:"canUpdate"`
	CanDelete      bool     `json:"canDelete"`
	SharedMenuKeys []string `json:"sharedMenuKeys"`
	Status         string   `json:"status"`
	CreatedAt      string   `json:"createdAt"`
	RespondedAt    string   `json:"respondedAt,omitempty"`
}

func (a *app) listFamilyMembers(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := pathID(w, r, "familyId")
	if !ok {
		a.log.Warn("family member list invalid family id", "userId", user.ID, "path", r.URL.Path)
		return
	}
	if !a.hasFamilyPermission(r.Context(), user, familyID, "read") {
		a.log.Warn("family member list permission denied", "userId", user.ID, "familyId", familyID)
		writeError(w, http.StatusForbidden, "permission denied")
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select m.id, m.family_id, m.user_id, coalesce(u.email, ''), coalesce(u.nickname, ''), m.role, m.can_read, m.can_create, m.can_update, m.can_delete, m.shared_menu_keys, m.joined_at
		from family_members m
		left join app_users u on u.id = m.user_id
		where m.family_id = $1
		order by m.joined_at asc
	`, familyID)
	if err != nil {
		a.log.Error("family member list query failed", "userId", user.ID, "familyId", familyID, "error", err)
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items := []familyMember{}
	for rows.Next() {
		var item familyMember
		var joinedAt time.Time
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.UserID, &item.Email, &item.Nickname, &item.Role, &item.CanRead, &item.CanCreate, &item.CanUpdate, &item.CanDelete, &item.SharedMenuKeys, &joinedAt); err != nil {
			a.log.Error("family member list scan failed", "userId", user.ID, "familyId", familyID, "error", err)
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return
		}
		item.JoinedAt = formatTime(joinedAt)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		a.log.Error("family member list iteration failed", "userId", user.ID, "familyId", familyID, "error", err)
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	a.log.Info("family member list resolved", "userId", user.ID, "familyId", familyID, "count", len(items))
	writeJSON(w, http.StatusOK, items)
}

func (a *app) addFamilyMember(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := pathID(w, r, "familyId")
	if !ok || !a.requireFamilyAdmin(w, r.Context(), user, familyID) {
		return
	}
	var req struct {
		UserID         int64     `json:"userId"`
		Invite         string    `json:"invite"`
		Role           string    `json:"role"`
		CanRead        bool      `json:"canRead"`
		CanCreate      bool      `json:"canCreate"`
		CanUpdate      bool      `json:"canUpdate"`
		CanDelete      bool      `json:"canDelete"`
		SharedMenuKeys *[]string `json:"sharedMenuKeys"`
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
		inviteeID, found, ambiguous := a.lookupInvitee(r.Context(), invite)
		if ambiguous {
			writeError(w, http.StatusConflict, "nickname is ambiguous; use email")
			return
		}
		if !found {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		req.UserID = inviteeID
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
		insert into family_members (family_id, user_id, role, joined_at, can_read, can_create, can_update, can_delete, shared_menu_keys)
		values ($1, $2, $3, now(), $4, $5, $6, $7, $8)
		returning id, family_id, user_id, role, can_read, can_create, can_update, can_delete, shared_menu_keys, joined_at
	`, familyID, req.UserID, emptyDefault(req.Role, "MEMBER"), req.CanRead, req.CanCreate, req.CanUpdate, req.CanDelete, normalizeSharedMenuKeys(req.SharedMenuKeys)).
		Scan(&item.ID, &item.FamilyID, &item.UserID, &item.Role, &item.CanRead, &item.CanCreate, &item.CanUpdate, &item.CanDelete, &item.SharedMenuKeys, &joinedAt)
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
		UserID         int64     `json:"userId"`
		Role           string    `json:"role"`
		CanRead        bool      `json:"canRead"`
		CanCreate      bool      `json:"canCreate"`
		CanUpdate      bool      `json:"canUpdate"`
		CanDelete      bool      `json:"canDelete"`
		SharedMenuKeys *[]string `json:"sharedMenuKeys"`
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
		update family_members set user_id = $1, role = $2, can_read = $3, can_create = $4, can_update = $5, can_delete = $6, shared_menu_keys = $7
		where id = $8 and family_id = $9
		returning id, family_id, user_id, role, can_read, can_create, can_update, can_delete, shared_menu_keys, joined_at
	`, req.UserID, nextRole, req.CanRead, req.CanCreate, req.CanUpdate, req.CanDelete, normalizeSharedMenuKeys(req.SharedMenuKeys), memberID, familyID).
		Scan(&item.ID, &item.FamilyID, &item.UserID, &item.Role, &item.CanRead, &item.CanCreate, &item.CanUpdate, &item.CanDelete, &item.SharedMenuKeys, &joinedAt)
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
	var memberRole string
	var familyAdminCount int
	err := a.db.QueryRow(r.Context(), `
		select user_id, role,
		       (select count(1) from family_members where family_id = $1 and role = 'FAMILY_ADMIN')
		from family_members
		where id = $2 and family_id = $1
	`, familyID, memberID).Scan(&memberUserID, &memberRole, &familyAdminCount)
	if err != nil {
		writeError(w, http.StatusNotFound, "family member not found")
		return
	}
	if memberUserID != user.ID && !a.requireFamilyAdmin(w, r.Context(), user, familyID) {
		return
	}
	if memberUserID == user.ID && memberRole == "FAMILY_ADMIN" && familyAdminCount <= 1 {
		if err := a.deleteFamilyGroupShell(r.Context(), familyID); err != nil {
			writeError(w, http.StatusInternalServerError, "family group deletion failed")
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	tag, err := a.db.Exec(r.Context(), "delete from family_members where id = $1 and family_id = $2", memberID, familyID)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "family member not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) deleteFamilyGroupShell(ctx context.Context, familyID int64) error {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := deleteFamilyGroupShellTx(ctx, tx, familyID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func deleteFamilyGroupShellTx(ctx context.Context, tx pgx.Tx, familyID int64) error {
	statements := []string{
		"delete from common_codes where group_id in (select id from common_code_groups where family_id = $1)",
		"delete from common_code_groups where family_id = $1",
		"delete from family_invitations where family_id = $1",
		"delete from app_notifications where family_id = $1",
		"delete from family_members where family_id = $1",
		"delete from family_groups where id = $1",
	}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement, familyID); err != nil {
			return err
		}
	}
	return nil
}

func (a *app) listFamilyInvitations(w http.ResponseWriter, r *http.Request, user authUser) {
	rows, err := a.db.Query(r.Context(), `
		select i.id, i.family_id, coalesce(f.name, ''), i.inviter_user_id, coalesce(inviter.nickname, ''), i.invitee_user_id,
		       coalesce(invitee.email, ''), coalesce(invitee.nickname, ''), i.role, i.can_read, i.can_create, i.can_update, i.can_delete,
		       i.shared_menu_keys, i.status, i.created_at, i.responded_at
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

func (a *app) listSentFamilyInvitations(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := pathID(w, r, "familyId")
	if !ok || !a.requireFamilyAdmin(w, r.Context(), user, familyID) {
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select i.id, i.family_id, coalesce(f.name, ''), i.inviter_user_id, coalesce(inviter.nickname, ''), i.invitee_user_id,
		       coalesce(invitee.email, ''), coalesce(invitee.nickname, ''), i.role, i.can_read, i.can_create, i.can_update, i.can_delete,
		       i.shared_menu_keys, i.status, i.created_at, i.responded_at
		from family_invitations i
		left join family_groups f on f.id = i.family_id
		left join app_users inviter on inviter.id = i.inviter_user_id
		left join app_users invitee on invitee.id = i.invitee_user_id
		where i.family_id = $1 and i.inviter_user_id = $2 and i.status = 'PENDING'
		order by i.created_at desc
	`, familyID, user.ID)
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
		Invite         string    `json:"invite"`
		Role           string    `json:"role"`
		CanRead        bool      `json:"canRead"`
		CanCreate      bool      `json:"canCreate"`
		CanUpdate      bool      `json:"canUpdate"`
		CanDelete      bool      `json:"canDelete"`
		SharedMenuKeys *[]string `json:"sharedMenuKeys"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	invite := strings.TrimSpace(req.Invite)
	if invite == "" {
		writeError(w, http.StatusBadRequest, "invitee is required")
		return
	}
	inviteeID, found, ambiguous := a.lookupInvitee(r.Context(), invite)
	if ambiguous {
		writeError(w, http.StatusConflict, "nickname is ambiguous; use email")
		return
	}
	if !found {
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
		insert into family_invitations (family_id, inviter_user_id, invitee_user_id, role, can_read, can_create, can_update, can_delete, shared_menu_keys, status, created_at)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', now())
		returning id, family_id, '', inviter_user_id, '', invitee_user_id, '', '', role, can_read, can_create, can_update, can_delete, shared_menu_keys, status, created_at, responded_at
	`, familyID, user.ID, inviteeID, emptyDefault(req.Role, "MEMBER"), req.CanRead, req.CanCreate, req.CanUpdate, req.CanDelete, normalizeSharedMenuKeys(req.SharedMenuKeys))
	item, ok := scanFamilyInvitation(w, row)
	if !ok {
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) cancelFamilyInvitation(w http.ResponseWriter, r *http.Request, user authUser) {
	invitationID, ok := pathID(w, r, "invitationId")
	if !ok {
		return
	}
	tag, err := a.db.Exec(r.Context(), `
		update family_invitations
		set status = 'CANCELED', responded_at = now()
		where id = $1 and inviter_user_id = $2 and status = 'PENDING'
	`, invitationID, user.ID)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "CANCELED"})
}

func (a *app) lookupInvitee(ctx context.Context, invite string) (int64, bool, bool) {
	invite = strings.TrimSpace(invite)
	if invite == "" {
		return 0, false, false
	}
	var rows pgx.Rows
	var err error
	if strings.Contains(invite, "@") {
		rows, err = a.db.Query(ctx, `
			select distinct id
			from (
				select id
				from app_users
				where lower(coalesce(email, '')) = lower($1)
				union
				select user_id as id
				from oauth_identities
				where lower(coalesce(email, '')) = lower($1)
			) matched
			order by id asc
		`, invite)
	} else {
		rows, err = a.db.Query(ctx, `
			select id
			from app_users
			where lower(coalesce(nickname, '')) = lower($1)
			order by id asc
		`, invite)
	}
	if err != nil {
		return 0, false, false
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		return 0, false, false
	}
	if len(ids) > 1 {
		return 0, true, true
	}
	return ids[0], true, false
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
	var inviterUserID int64
	var role string
	var canRead, canCreate, canUpdate, canDelete bool
	var sharedMenuKeys []string
	err = tx.QueryRow(r.Context(), `
		select family_id, inviter_user_id, role, can_read, can_create, can_update, can_delete, shared_menu_keys
		from family_invitations
		where id = $1 and invitee_user_id = $2 and status = 'PENDING'
		for update
	`, invitationID, user.ID).Scan(&familyID, &inviterUserID, &role, &canRead, &canCreate, &canUpdate, &canDelete, &sharedMenuKeys)
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
		insert into family_members (family_id, user_id, role, joined_at, can_read, can_create, can_update, can_delete, shared_menu_keys)
		values ($1, $2, $3, now(), $4, $5, $6, $7, $8)
	`, familyID, user.ID, emptyDefault(role, "MEMBER"), canRead, canCreate, canUpdate, canDelete, sharedMenuKeys); err != nil {
		writeError(w, http.StatusInternalServerError, "family membership creation failed")
		return
	}
	if _, err := tx.Exec(r.Context(), "update family_invitations set status = 'ACCEPTED', responded_at = now() where id = $1", invitationID); err != nil {
		writeError(w, http.StatusInternalServerError, "invitation update failed")
		return
	}
	acceptedName := a.displayName(r.Context(), user)
	_, _ = tx.Exec(r.Context(), `
		insert into app_notifications (user_id, family_id, type, title, body, target_date, created_at)
		values ($1, $2, 'FAMILY_INVITE_ACCEPTED', $3, $4, current_date, now())
	`, inviterUserID, familyID, acceptedName+" 님이 초대를 수락했습니다.", acceptedName+" 님이 그룹에 참여했습니다.")
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
	var familyID int64
	var inviterUserID int64
	err := a.db.QueryRow(r.Context(), `
		select family_id, inviter_user_id
		from family_invitations
		where id = $1 and invitee_user_id = $2 and status = 'PENDING'
	`, invitationID, user.ID).Scan(&familyID, &inviterUserID)
	if err != nil {
		writeError(w, http.StatusNotFound, "invitation not found")
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
	rejectedName := a.displayName(r.Context(), user)
	_, _ = a.db.Exec(r.Context(), `
		insert into app_notifications (user_id, family_id, type, title, body, target_date, created_at)
		values ($1, $2, 'FAMILY_INVITE_REJECTED', $3, $4, current_date, now())
	`, inviterUserID, familyID, rejectedName+" 님이 초대를 거절하셨습니다.", rejectedName+" 님이 그룹 초대를 거절하셨습니다.")
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
	familyID, start, end, ok := a.familyDateRange(w, r, user)
	if !ok || (familyID > 0 && !a.requireFamilyPermission(w, r.Context(), user, familyID, "read")) {
		return
	}
	canShare := familyID > 0 && a.hasFamilyPermissionForMenu(r.Context(), user, familyID, "read", "ledger")
	rows, err := a.db.Query(r.Context(), `
		select id, family_id, title, entry_type, category, payment_method, member_name, coalesce(amount, 0),
		       transaction_date, memo, created_at
		from ledger_entries
		where transaction_date between $2 and $3 and deleted_at is null
		  and (
		    created_by_user_id = $4
		    or ($1 > 0 and $5 = true and exists (
		      select 1 from family_members owner
		      where owner.family_id = $1 and owner.user_id = created_by_user_id and $6 = any(owner.shared_menu_keys)
		    ))
		  )
		order by transaction_date desc, created_at desc
	`, familyID, start, end, user.ID, canShare, "ledger")
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
	familyID, start, end, ok := a.familyDateRange(w, r, user)
	if !ok || (familyID > 0 && !a.requireFamilyPermission(w, r.Context(), user, familyID, "read")) {
		return
	}
	canShare := familyID > 0 && a.hasFamilyPermissionForMenu(r.Context(), user, familyID, "read", "ledger")
	var expense, income float64
	err := a.db.QueryRow(r.Context(), `
		select
		  coalesce(sum(case when entry_type = 'expense' then amount else 0 end), 0),
		  coalesce(sum(case when entry_type = 'income' then amount else 0 end), 0)
		from ledger_entries
		where transaction_date between $2 and $3 and deleted_at is null
		  and (
		    created_by_user_id = $4
		    or ($1 > 0 and $5 = true and exists (
		      select 1 from family_members owner
		      where owner.family_id = $1 and owner.user_id = created_by_user_id and $6 = any(owner.shared_menu_keys)
		    ))
		  )
	`, familyID, start, end, user.ID, canShare, "ledger").Scan(&expense, &income)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]float64{"expense": expense, "income": income, "total": income - expense})
}

func (a *app) createLedgerEntry(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := a.requestFamilyID(w, r, user)
	if !ok {
		return
	}
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	req, ok := readLedgerPayload(w, r)
	if !ok {
		return
	}
	if req.InstallmentMonths > 1 {
		items, ok := a.saveLedgerInstallments(w, r, familyID, req, user.ID)
		if !ok {
			return
		}
		for _, item := range items {
			a.recordDataChange(r.Context(), "ledger_entry", item.ID, familyID, user.ID, "create", item)
		}
		writeJSON(w, http.StatusCreated, items[0])
		return
	}
	item, ok := a.saveLedgerEntry(w, r, 0, familyID, req, user.ID)
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
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from ledger_entries where id = $1 and deleted_at is null", entryID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "update", ownerID, "ledger") {
		return
	}
	req, ok := readLedgerPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveLedgerEntry(w, r, entryID, familyID, req, user.ID)
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
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from ledger_entries where id = $1 and deleted_at is null", entryID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "delete", ownerID, "ledger") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "update ledger_entries set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", entryID)
	a.recordDataChange(r.Context(), "ledger_entry", entryID, familyID, user.ID, "delete", map[string]any{"id": entryID})
	w.WriteHeader(http.StatusNoContent)
}

type scheduleItem struct {
	ID             int64    `json:"id"`
	FamilyID       int64    `json:"familyId"`
	Title          string   `json:"title"`
	CalendarBasis  string   `json:"calendarBasis"`
	ScheduleDate   string   `json:"scheduleDate"`
	ScheduleTime   *string  `json:"scheduleTime,omitempty"`
	Category       *string  `json:"category,omitempty"`
	MemberName     *string  `json:"memberName,omitempty"`
	RepeatRule     *string  `json:"repeatRule,omitempty"`
	PushEnabled    bool     `json:"pushEnabled"`
	ExceptionDates []string `json:"exceptionDates,omitempty"`
	Memo           *string  `json:"memo,omitempty"`
	CreatedAt      string   `json:"createdAt"`
}

func (a *app) listSchedules(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, start, end, ok := a.familyDateRange(w, r, user)
	if !ok || (familyID > 0 && !a.requireFamilyPermission(w, r.Context(), user, familyID, "read")) {
		return
	}
	canShare := familyID > 0 && a.hasFamilyPermissionForMenu(r.Context(), user, familyID, "read", "calendar")
	rows, err := a.db.Query(r.Context(), `
		select id, coalesce(family_id, 0), title, calendar_basis, schedule_date, schedule_time::text, category, member_name, repeat_rule, memo, push_enabled, created_at,
		  coalesce((
		    select array_agg(to_char(e.occurrence_date, 'YYYY-MM-DD') order by e.occurrence_date)
		    from family_schedule_exceptions e
		    where e.schedule_id = family_schedules.id
		  ), array[]::text[]) as exception_dates
		from family_schedules
		where schedule_date between $2 and $3 and deleted_at is null
		  and (
		    created_by_user_id = $4
		    or ($1 > 0 and $5 = true and exists (
		      select 1 from family_members owner
		      where owner.family_id = $1 and owner.user_id = created_by_user_id and $6 = any(owner.shared_menu_keys)
		    ))
		  )
		order by schedule_date asc, schedule_time asc nulls last, created_at desc
	`, familyID, start, end, user.ID, canShare, "calendar")
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
	familyID, ok := a.requestFamilyID(w, r, user)
	if !ok {
		return
	}
	if familyID > 0 && !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	req, ok := readSchedulePayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveSchedule(w, r, 0, familyID, req, user.ID)
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
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select coalesce(family_id, 0), created_by_user_id from family_schedules where id = $1 and deleted_at is null", id)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "update", ownerID, "calendar") {
		return
	}
	req, ok := readSchedulePayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveSchedule(w, r, id, familyID, req, user.ID)
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
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select coalesce(family_id, 0), created_by_user_id from family_schedules where id = $1 and deleted_at is null", id)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "delete", ownerID, "calendar") {
		return
	}
	_, _ = a.db.Exec(r.Context(), "update family_schedules set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", id)
	a.recordDataChange(r.Context(), "family_schedule", id, familyID, user.ID, "delete", map[string]any{"id": id})
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) createScheduleException(w http.ResponseWriter, r *http.Request, user authUser) {
	id, ok := pathID(w, r, "scheduleId")
	if !ok {
		return
	}
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select coalesce(family_id, 0), created_by_user_id from family_schedules where id = $1 and deleted_at is null", id)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "update", ownerID, "calendar") {
		return
	}
	req, ok := readScheduleExceptionPayload(w, r)
	if !ok {
		return
	}
	_, err := a.db.Exec(r.Context(), `
		insert into family_schedule_exceptions (schedule_id, occurrence_date, created_at)
		values ($1, $2, now())
		on conflict (schedule_id, occurrence_date) do nothing
	`, id, req.OccurrenceDate)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "schedule exception save failed")
		return
	}
	a.recordDataChange(r.Context(), "family_schedule_exception", id, familyID, user.ID, "create", req)
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
	if !a.requireFamilyAdmin(w, r.Context(), user, familyID) {
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
	a.recordDataChange(r.Context(), "common_code_group", item.ID, familyID, user.ID, "create", item)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateCommonCodeGroup(w http.ResponseWriter, r *http.Request, user authUser) {
	id, ok := pathID(w, r, "groupId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from common_code_groups where id = $1", id)
	if !ok || !a.requireFamilyAdmin(w, r.Context(), user, familyID) {
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
	a.recordDataChange(r.Context(), "common_code_group", item.ID, familyID, user.ID, "update", item)
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteCommonCodeGroup(w http.ResponseWriter, r *http.Request, user authUser) {
	id, ok := pathID(w, r, "groupId")
	if !ok {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from common_code_groups where id = $1", id)
	if !ok || !a.requireFamilyAdmin(w, r.Context(), user, familyID) {
		return
	}
	a.recordDataChange(r.Context(), "common_code_group", id, familyID, user.ID, "delete", map[string]any{"id": id})
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
	if !ok || !a.requireFamilyAdmin(w, r.Context(), user, familyID) {
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
	a.recordDataChange(r.Context(), "common_code", item.ID, familyID, user.ID, "create", item)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateCommonCode(w http.ResponseWriter, r *http.Request, user authUser) {
	groupID, ok := pathID(w, r, "groupId")
	codeID, ok2 := pathID(w, r, "codeId")
	if !ok || !ok2 {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from common_code_groups where id = $1", groupID)
	if !ok || !a.requireFamilyAdmin(w, r.Context(), user, familyID) {
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
	a.recordDataChange(r.Context(), "common_code", item.ID, familyID, user.ID, "update", item)
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteCommonCode(w http.ResponseWriter, r *http.Request, user authUser) {
	groupID, ok := pathID(w, r, "groupId")
	codeID, ok2 := pathID(w, r, "codeId")
	if !ok || !ok2 {
		return
	}
	familyID, ok := a.resourceFamilyID(w, r.Context(), "select family_id from common_code_groups where id = $1", groupID)
	if !ok || !a.requireFamilyAdmin(w, r.Context(), user, familyID) {
		return
	}
	a.recordDataChange(r.Context(), "common_code", codeID, familyID, user.ID, "delete", map[string]any{"id": codeID, "groupId": groupID})
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
	familyID, ok := a.requestFamilyID(w, r, user)
	if !ok {
		return
	}
	if familyID > 0 && !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	canShare := familyID > 0 && a.hasFamilyPermissionForMenu(r.Context(), user, familyID, "read", "travel")
	rows, err := a.db.Query(r.Context(), `
		select id, family_id, title, start_date, end_date, description, created_at
		from trips
		where deleted_at is null
		  and (
		    created_by_user_id = $2
		    or ($1 > 0 and $3 = true and exists (
		      select 1 from family_members owner
		      where owner.family_id = $1 and owner.user_id = created_by_user_id and $4 = any(owner.shared_menu_keys)
		    ))
		  )
		order by created_at desc
	`, familyID, user.ID, canShare, "travel")
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
	familyID, ok := a.requestFamilyID(w, r, user)
	if !ok {
		return
	}
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	req, ok := readTripPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveTrip(w, r, 0, familyID, req, user.ID)
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
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from trips where id = $1 and deleted_at is null", tripID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "update", ownerID, "travel") {
		return
	}
	req, ok := readTripPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveTrip(w, r, tripID, familyID, req, user.ID)
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
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from trips where id = $1 and deleted_at is null", tripID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "delete", ownerID, "travel") {
		return
	}
	mediaURLs := a.mediaURLsByQuery(r.Context(), `
		select m.media_urls from travel_record_media_urls m
		join travel_records r on r.id = m.travel_record_id
		where r.trip_id = $1 and r.deleted_at is null
	`, tripID)
	_, _ = a.db.Exec(r.Context(), "update travel_records set deleted_at = now(), updated_at = now() where trip_id = $1 and deleted_at is null", tripID)
	_, _ = a.db.Exec(r.Context(), "update trips set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", tripID)
	a.deleteUnusedMediaURLs(r.Context(), mediaURLs)
	a.recordDataChange(r.Context(), "trip", tripID, familyID, user.ID, "delete", map[string]any{"id": tripID})
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) listTravelRecords(w http.ResponseWriter, r *http.Request, user authUser) {
	tripID, ok := pathID(w, r, "tripId")
	if !ok {
		return
	}
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from trips where id = $1 and deleted_at is null", tripID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "read", ownerID, "travel") {
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
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from trips where id = $1 and deleted_at is null", tripID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "create", ownerID, "travel") {
		return
	}
	req, ok := readTravelRecordPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveTravelRecord(w, r, 0, tripID, req, user.ID)
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
	var ownerID sql.NullInt64
	err := a.db.QueryRow(r.Context(), `
		select r.trip_id, t.family_id, r.created_by_user_id from travel_records r join trips t on t.id = r.trip_id where r.id = $1 and r.deleted_at is null and t.deleted_at is null
	`, recordID).Scan(&tripID, &familyID, &ownerID)
	if err != nil {
		writeError(w, http.StatusNotFound, "travel record not found")
		return
	}
	if !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "update", ownerID, "travel") {
		return
	}
	req, ok := readTravelRecordPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveTravelRecord(w, r, recordID, tripID, req, user.ID)
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
	var ownerID sql.NullInt64
	err := a.db.QueryRow(r.Context(), `
		select r.trip_id, t.family_id, r.created_by_user_id from travel_records r join trips t on t.id = r.trip_id where r.id = $1 and r.deleted_at is null and t.deleted_at is null
	`, recordID).Scan(&tripID, &familyID, &ownerID)
	if err != nil {
		writeError(w, http.StatusNotFound, "travel record not found")
		return
	}
	if !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "delete", ownerID, "travel") {
		return
	}
	mediaURLs := a.mediaURLs(r.Context(), "travel_record_media_urls", "travel_record_id", recordID)
	_, _ = a.db.Exec(r.Context(), "update travel_records set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", recordID)
	a.deleteUnusedMediaURLs(r.Context(), mediaURLs)
	a.recordDataChange(r.Context(), "travel_record", recordID, familyID, user.ID, "delete", map[string]any{"id": recordID, "tripId": tripID})
	_ = tripID
	w.WriteHeader(http.StatusNoContent)
}

type restaurantItem struct {
	ID        int64    `json:"id"`
	FamilyID  int64    `json:"familyId"`
	Name      string   `json:"name"`
	Menu      *string  `json:"menu,omitempty"`
	Price     *float64 `json:"price,omitempty"`
	Rating    *float64 `json:"rating,omitempty"`
	VisitDate string   `json:"visitDate"`
	Location  *string  `json:"location,omitempty"`
	Address   *string  `json:"address,omitempty"`
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
	Memo      *string  `json:"memo,omitempty"`
	MediaURLs []string `json:"mediaUrls"`
	CreatedAt string   `json:"createdAt"`
}

type restaurantPayload struct {
	Name      string   `json:"name"`
	Menu      *string  `json:"menu"`
	Price     *float64 `json:"price"`
	Rating    *float64 `json:"rating"`
	VisitDate string   `json:"visitDate"`
	Location  *string  `json:"location"`
	Address   *string  `json:"address"`
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
	Memo      *string  `json:"memo"`
	MediaURLs []string `json:"mediaUrls"`
}

func (a *app) listRestaurants(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := a.requestFamilyID(w, r, user)
	if !ok {
		return
	}
	if familyID > 0 && !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	canShare := familyID > 0 && a.hasFamilyPermissionForMenu(r.Context(), user, familyID, "read", "restaurant")
	rows, err := a.db.Query(r.Context(), `
		select id, family_id, name, menu, price, rating, visit_date, location, address, latitude, longitude, memo, created_at
		from restaurants
		where deleted_at is null
		  and (
		    created_by_user_id = $2
		    or ($1 > 0 and $3 = true and exists (
		      select 1 from family_members owner
		      where owner.family_id = $1 and owner.user_id = created_by_user_id and $4 = any(owner.shared_menu_keys)
		    ))
		  )
		order by visit_date desc, created_at desc
	`, familyID, user.ID, canShare, "restaurant")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items, ok := a.scanRestaurants(w, r.Context(), rows)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *app) createRestaurant(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := a.requestFamilyID(w, r, user)
	if !ok {
		return
	}
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	req, ok := readRestaurantPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveRestaurant(w, r, 0, familyID, req, user.ID)
	if !ok {
		return
	}
	a.recordDataChange(r.Context(), "restaurant", item.ID, familyID, user.ID, "create", item)
	writeJSON(w, http.StatusCreated, item)
}

func (a *app) updateRestaurant(w http.ResponseWriter, r *http.Request, user authUser) {
	restaurantID, ok := pathID(w, r, "restaurantId")
	if !ok {
		return
	}
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from restaurants where id = $1 and deleted_at is null", restaurantID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "update", ownerID, "restaurant") {
		return
	}
	req, ok := readRestaurantPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveRestaurant(w, r, restaurantID, familyID, req, user.ID)
	if !ok {
		return
	}
	a.recordDataChange(r.Context(), "restaurant", item.ID, familyID, user.ID, "update", item)
	writeJSON(w, http.StatusOK, item)
}

func (a *app) deleteRestaurant(w http.ResponseWriter, r *http.Request, user authUser) {
	restaurantID, ok := pathID(w, r, "restaurantId")
	if !ok {
		return
	}
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from restaurants where id = $1 and deleted_at is null", restaurantID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "delete", ownerID, "restaurant") {
		return
	}
	mediaURLs := a.mediaURLs(r.Context(), "restaurant_media_urls", "restaurant_id", restaurantID)
	_, _ = a.db.Exec(r.Context(), "update restaurants set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", restaurantID)
	a.deleteUnusedMediaURLs(r.Context(), mediaURLs)
	a.recordDataChange(r.Context(), "restaurant", restaurantID, familyID, user.ID, "delete", map[string]any{"id": restaurantID})
	w.WriteHeader(http.StatusNoContent)
}

type babyProfileItem struct {
	ID              int64    `json:"id"`
	FamilyID        int64    `json:"familyId"`
	Name            string   `json:"name"`
	Gender          *string  `json:"gender,omitempty"`
	BirthDate       string   `json:"birthDate"`
	Memo            *string  `json:"memo,omitempty"`
	PhotoURL        *string  `json:"photoUrl,omitempty"`
	InitialHeightCm *float64 `json:"initialHeightCm,omitempty"`
	InitialWeightKg *float64 `json:"initialWeightKg,omitempty"`
	LatestHeightCm  *float64 `json:"latestHeightCm,omitempty"`
	LatestWeightKg  *float64 `json:"latestWeightKg,omitempty"`
	CreatedAt       string   `json:"createdAt"`
}

type babyRecordItem struct {
	ID           int64    `json:"id"`
	BabyID       int64    `json:"babyId"`
	RecordType   string   `json:"recordType"`
	RecordDate   string   `json:"recordDate"`
	RecordTime   *string  `json:"recordTime,omitempty"`
	SleepEndTime *string  `json:"sleepEndTime,omitempty"`
	AmountMl     *int     `json:"amountMl,omitempty"`
	HeightCm     *float64 `json:"heightCm,omitempty"`
	WeightKg     *float64 `json:"weightKg,omitempty"`
	Memo         *string  `json:"memo,omitempty"`
	MediaURLs    []string `json:"mediaUrls"`
	CreatedAt    string   `json:"createdAt"`
}

func (a *app) listBabies(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, ok := a.requestFamilyID(w, r, user)
	if !ok {
		return
	}
	if familyID > 0 && !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
		return
	}
	canShare := familyID > 0 && a.hasFamilyPermissionForMenu(r.Context(), user, familyID, "read", "baby")
	rows, err := a.db.Query(r.Context(), `
		select b.id, b.family_id, b.name, b.gender, b.birth_date, b.memo, b.photo_url,
		       b.initial_height_cm, b.initial_weight_kg,
		       coalesce((select r.height_cm from baby_records r where r.baby_id = b.id and r.deleted_at is null and r.height_cm is not null order by r.record_date desc, r.created_at desc limit 1), b.initial_height_cm),
		       coalesce((select r.weight_kg from baby_records r where r.baby_id = b.id and r.deleted_at is null and r.weight_kg is not null order by r.record_date desc, r.created_at desc limit 1), b.initial_weight_kg),
		       b.created_at
		from baby_profiles b
		where b.deleted_at is null
		  and (
		    b.created_by_user_id = $2
		    or ($1 > 0 and $3 = true and exists (
		      select 1 from family_members owner
		      where owner.family_id = $1 and owner.user_id = b.created_by_user_id and $4 = any(owner.shared_menu_keys)
		    ))
		  )
		order by b.created_at desc
	`, familyID, user.ID, canShare, "baby")
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
	familyID, ok := a.requestFamilyID(w, r, user)
	if !ok {
		return
	}
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	req, ok := readBabyPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveBaby(w, r, 0, familyID, req, user.ID)
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
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from baby_profiles where id = $1 and deleted_at is null", babyID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "update", ownerID, "baby") {
		return
	}
	req, ok := readBabyPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveBaby(w, r, babyID, familyID, req, user.ID)
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
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from baby_profiles where id = $1 and deleted_at is null", babyID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "delete", ownerID, "baby") {
		return
	}
	var photoURL sql.NullString
	if err := a.db.QueryRow(r.Context(), "select photo_url from baby_profiles where id = $1 and deleted_at is null", babyID).Scan(&photoURL); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	mediaURLs := a.mediaURLsByQuery(r.Context(), `
		select m.media_urls from baby_record_media_urls m
		join baby_records r on r.id = m.baby_record_id
		where r.baby_id = $1 and r.deleted_at is null
	`, babyID)
	if photoURL.Valid {
		mediaURLs = append(mediaURLs, photoURL.String)
	}
	_, _ = a.db.Exec(r.Context(), "update baby_records set deleted_at = now(), updated_at = now() where baby_id = $1 and deleted_at is null", babyID)
	_, _ = a.db.Exec(r.Context(), "update baby_profiles set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", babyID)
	a.deleteUnusedMediaURLs(r.Context(), mediaURLs)
	a.recordDataChange(r.Context(), "baby_profile", babyID, familyID, user.ID, "delete", map[string]any{"id": babyID})
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) listBabyRecords(w http.ResponseWriter, r *http.Request, user authUser) {
	babyID, ok := pathID(w, r, "babyId")
	if !ok {
		return
	}
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from baby_profiles where id = $1 and deleted_at is null", babyID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "read", ownerID, "baby") {
		return
	}
	start, end := r.URL.Query().Get("startDate"), r.URL.Query().Get("endDate")
	query := `
		select id, baby_id, record_type, record_date, record_time, sleep_end_time, amount_ml, height_cm, weight_kg, memo, created_at
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
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from baby_profiles where id = $1 and deleted_at is null", babyID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "create", ownerID, "baby") {
		return
	}
	req, ok := readBabyRecordPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveBabyRecord(w, r, 0, babyID, req, user.ID)
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
	var ownerID sql.NullInt64
	err := a.db.QueryRow(r.Context(), `select r.baby_id, b.family_id, r.created_by_user_id from baby_records r join baby_profiles b on b.id = r.baby_id where r.id = $1 and r.deleted_at is null and b.deleted_at is null`, recordID).Scan(&babyID, &familyID, &ownerID)
	if err != nil {
		writeError(w, http.StatusNotFound, "baby record not found")
		return
	}
	if !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "update", ownerID, "baby") {
		return
	}
	req, ok := readBabyRecordPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveBabyRecord(w, r, recordID, babyID, req, user.ID)
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
	var ownerID sql.NullInt64
	err := a.db.QueryRow(r.Context(), `select b.family_id, r.created_by_user_id from baby_records r join baby_profiles b on b.id = r.baby_id where r.id = $1 and r.deleted_at is null and b.deleted_at is null`, recordID).Scan(&familyID, &ownerID)
	if err != nil {
		writeError(w, http.StatusNotFound, "baby record not found")
		return
	}
	if !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "delete", ownerID, "baby") {
		return
	}
	mediaURLs := a.mediaURLs(r.Context(), "baby_record_media_urls", "baby_record_id", recordID)
	_, _ = a.db.Exec(r.Context(), "update baby_records set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", recordID)
	a.deleteUnusedMediaURLs(r.Context(), mediaURLs)
	a.recordDataChange(r.Context(), "baby_record", recordID, familyID, user.ID, "delete", map[string]any{"id": recordID})
	w.WriteHeader(http.StatusNoContent)
}

type diaryItem struct {
	ID             int64    `json:"id"`
	FamilyID       int64    `json:"familyId"`
	Title          string   `json:"title"`
	Body           string   `json:"body"`
	DiaryDate      string   `json:"diaryDate"`
	DiaryTime      *string  `json:"diaryTime,omitempty"`
	Weather        *string  `json:"weather,omitempty"`
	Mood           *string  `json:"mood,omitempty"`
	MinTemperature *int     `json:"minTemperature,omitempty"`
	MaxTemperature *int     `json:"maxTemperature,omitempty"`
	MediaURLs      []string `json:"mediaUrls"`
	CreatedAt      string   `json:"createdAt"`
}

func (a *app) listDiaries(w http.ResponseWriter, r *http.Request, user authUser) {
	familyID, start, end, ok := a.familyDateRange(w, r, user)
	if !ok || (familyID > 0 && !a.requireFamilyPermission(w, r.Context(), user, familyID, "read")) {
		return
	}
	canShare := familyID > 0 && a.hasFamilyPermissionForMenu(r.Context(), user, familyID, "read", "diary")
	rows, err := a.db.Query(r.Context(), `
		select id, family_id, title, body, diary_date, diary_time::text, weather, mood, min_temperature, max_temperature, created_at
		from family_diaries
		where diary_date between $2 and $3 and deleted_at is null
		  and (
		    created_by_user_id = $4
		    or ($1 > 0 and $5 = true and exists (
		      select 1 from family_members owner
		      where owner.family_id = $1 and owner.user_id = created_by_user_id and $6 = any(owner.shared_menu_keys)
		    ))
		  )
		order by diary_date desc, diary_time desc nulls last, created_at desc
	`, familyID, start, end, user.ID, canShare, "diary")
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
	familyID, ok := a.requestFamilyID(w, r, user)
	if !ok {
		return
	}
	if !a.requireFamilyPermission(w, r.Context(), user, familyID, "create") {
		return
	}
	req, ok := readDiaryPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveDiary(w, r, 0, familyID, req, user.ID)
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
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from family_diaries where id = $1 and deleted_at is null", diaryID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "update", ownerID, "diary") {
		return
	}
	req, ok := readDiaryPayload(w, r)
	if !ok {
		return
	}
	item, ok := a.saveDiary(w, r, diaryID, familyID, req, user.ID)
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
	familyID, ownerID, ok := a.resourceFamilyOwner(w, r.Context(), "select family_id, created_by_user_id from family_diaries where id = $1 and deleted_at is null", diaryID)
	if !ok || !a.requireFamilyPermissionOrOwnerForMenu(w, r.Context(), user, familyID, "delete", ownerID, "diary") {
		return
	}
	mediaURLs := a.mediaURLs(r.Context(), "family_diary_media_urls", "family_diary_id", diaryID)
	_, _ = a.db.Exec(r.Context(), "update family_diaries set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", diaryID)
	a.deleteUnusedMediaURLs(r.Context(), mediaURLs)
	a.recordDataChange(r.Context(), "family_diary", diaryID, familyID, user.ID, "delete", map[string]any{"id": diaryID})
	w.WriteHeader(http.StatusNoContent)
}

// Hot-deal feeds deliberately retain only the source name and the original URL.
// We do not copy post titles, descriptions, images, or other publisher content.
// Sources marked as collectionEnabled are fetched only where their public
// robots policy permits it; other sources are exposed as direct board links.
type communityHotDealSource struct {
	Key               string `json:"key"`
	Label             string `json:"label"`
	ListingURL        string `json:"listingUrl"`
	CollectionEnabled bool   `json:"collectionEnabled"`
	ListingPages      int    `json:"-"`
	MaxItemsPerPage   int    `json:"-"`
	allowedPath       func(*url.URL) bool
}

type communityHotDealItem struct {
	Source          string `json:"source"`
	SourceLabel     string `json:"sourceLabel"`
	Title           string `json:"title"`
	Summary         string `json:"summary"`
	Price           string `json:"price"`
	OriginalURL     string `json:"originalUrl"`
	CollectedAt     string `json:"collectedAt"`
	PublishedAt     string `json:"publishedAt"`
	ViewCount       int64  `json:"viewCount"`
	CommentCount    int64  `json:"commentCount"`
	PopularityScore int64  `json:"popularityScore"`
}

type communityHotDealResponse struct {
	Items       []communityHotDealItem   `json:"items"`
	Sources     []communityHotDealSource `json:"sources"`
	RefreshedAt string                   `json:"refreshedAt"`
	Published   bool                     `json:"published"`
}

var communityHotDealSources = []communityHotDealSource{
	{
		Key: "ppomppu", Label: "뽐뿌", ListingURL: "https://www.ppomppu.co.kr/zboard/zboard.php?id=ppomppu", CollectionEnabled: true, ListingPages: 8, MaxItemsPerPage: 30,
		allowedPath: func(link *url.URL) bool {
			return link.Host == "www.ppomppu.co.kr" && link.Path == "/zboard/view.php" && link.Query().Get("id") == "ppomppu" && link.Query().Get("no") != ""
		},
	},
	{
		Key: "ppomppu-overseas", Label: "뽐뿌 해외", ListingURL: "https://www.ppomppu.co.kr/zboard/zboard.php?id=ppomppu4", CollectionEnabled: true, ListingPages: 2, MaxItemsPerPage: 20,
		allowedPath: func(link *url.URL) bool {
			return link.Host == "www.ppomppu.co.kr" && link.Path == "/zboard/view.php" && link.Query().Get("id") == "ppomppu4" && link.Query().Get("no") != ""
		},
	},
	{
		Key: "algumon", Label: "알구몬", ListingURL: "https://algumon.com/n/deal", CollectionEnabled: true,
		allowedPath: func(link *url.URL) bool {
			return link.Host == "algumon.com" && strings.HasPrefix(link.Path, "/n/d/")
		},
	},
	{
		Key: "quasarzone", Label: "퀘이사존", ListingURL: "https://quasarzone.com/bbs/qb_saleinfo", CollectionEnabled: true,
		allowedPath: func(link *url.URL) bool {
			return link.Host == "quasarzone.com" && strings.HasPrefix(link.Path, "/bbs/qb_saleinfo/views/")
		},
	},
	{
		Key: "fmkorea", Label: "FM코리아", ListingURL: "https://www.fmkorea.com/hotdeal", CollectionEnabled: true,
		allowedPath: func(link *url.URL) bool {
			return link.Host == "www.fmkorea.com" && strings.HasPrefix(link.Path, "/hotdeal/")
		},
	},
	{
		Key: "ruliweb", Label: "루리웹", ListingURL: "https://bbs.ruliweb.com/market/board/1020", CollectionEnabled: true,
		allowedPath: func(link *url.URL) bool {
			return link.Host == "bbs.ruliweb.com" && strings.HasPrefix(link.Path, "/market/board/1020/read/")
		},
	},
	{
		Key: "clien", Label: "클리앙", ListingURL: "https://www.clien.net/service/board/jirum", CollectionEnabled: true,
		allowedPath: func(link *url.URL) bool {
			return link.Host == "www.clien.net" && strings.HasPrefix(link.Path, "/service/board/jirum/")
		},
	},
	{
		Key: "coolenjoy", Label: "쿨엔조이", ListingURL: "https://coolenjoy.net/bbs/jirum", CollectionEnabled: true,
		allowedPath: func(link *url.URL) bool {
			return link.Host == "coolenjoy.net" && strings.HasPrefix(link.Path, "/bbs/jirum/")
		},
	},
	{
		Key: "eomisae", Label: "어미새", ListingURL: "https://eomisae.co.kr/fs", CollectionEnabled: true,
		allowedPath: func(link *url.URL) bool { return link.Host == "eomisae.co.kr" && strings.HasPrefix(link.Path, "/fs/") },
	},
	{
		Key: "dealbada", Label: "딜바다", ListingURL: "https://www.dealbada.com/bbs/board.php?bo_table=deal_domestic", CollectionEnabled: true,
		allowedPath: func(link *url.URL) bool {
			return link.Host == "www.dealbada.com" && link.Path == "/bbs/board.php" && link.Query().Get("bo_table") == "deal_domestic" && link.Query().Get("wr_id") != ""
		},
	},
	{
		Key: "damoang", Label: "다모앙", ListingURL: "https://damoang.net/economy", CollectionEnabled: true,
		allowedPath: func(link *url.URL) bool {
			return link.Host == "damoang.net" && strings.HasPrefix(link.Path, "/economy/")
		},
	},
	{
		Key: "arca", Label: "아카라이브", ListingURL: "https://arca.live/b/hotdeal", CollectionEnabled: true,
		allowedPath: func(link *url.URL) bool {
			return link.Host == "arca.live" && strings.HasPrefix(link.Path, "/b/hotdeal/")
		},
	},
}

var communityHotDealAnchorPattern = regexp.MustCompile(`(?is)<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)</a>`)
var communityHotDealTagPattern = regexp.MustCompile(`(?is)<[^>]+>`)
var communityHotDealWhitespacePattern = regexp.MustCompile(`\s+`)
var communityHotDealNoticeTitlePattern = regexp.MustCompile(`(?i)(?:이용\s*안내|게시판\s*안내|공지\s*사항|운영\s*안내|필독|\b(?:notice|announcement|board\s+guide)\b)`)
var communityHotDealMetaTagPattern = regexp.MustCompile(`(?is)<meta\b[^>]*>`)
var communityHotDealAttributePattern = regexp.MustCompile(`(?is)([a-zA-Z:-]+)\s*=\s*["']([^"']*)["']`)
var communityHotDealCharsetPattern = regexp.MustCompile(`(?is)<meta\b[^>]*charset\s*=\s*["']?\s*([a-z0-9._-]+)`)
var communityHotDealPricePattern = regexp.MustCompile(`(?i)(?:₩\s?[\d,.]+|[$€¥]\s?[\d,.]+|(?:\d{1,3}(?:,\d{3})+|\d{4,})\s*원|\d+(?:\.\d+)?\s*만원|(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?:달러|엔))`)
var communityHotDealSlashPricePattern = regexp.MustCompile(`(?i)(\d{1,3}(?:,\d{3})+|\d{4,})\s*/\s*(?:\d[\d,]*|무료|배송(?:비)?)`)
var communityHotDealViewCountPattern = regexp.MustCompile(`(?i)(?:조회(?:수)?|view(?:s)?)\s*[:：]?\s*([0-9][0-9,]*)`)
var communityHotDealCommentCountPattern = regexp.MustCompile(`(?i)(?:댓글|코멘트|comment(?:s)?)\s*[:：]?\s*([0-9][0-9,]*)`)
var communityHotDealPublishedAtPattern = regexp.MustCompile(`\b(20\d{2})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})(?:[\sT]+(?:\([^)]*\)\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?)?`)

var communityHotDealHTTPClient = &http.Client{Timeout: 10 * time.Second}

var communityHotDealCache struct {
	sync.Mutex
	fetchedAt time.Time
	response  communityHotDealResponse
}

func publicCommunityHotDealSources() []communityHotDealSource {
	sources := make([]communityHotDealSource, 0, len(communityHotDealSources))
	for _, source := range communityHotDealSources {
		source.allowedPath = nil
		sources = append(sources, source)
	}
	return sources
}

func unpublishedCommunityHotDeals() communityHotDealResponse {
	return communityHotDealResponse{
		Items:   []communityHotDealItem{},
		Sources: []communityHotDealSource{},
	}
}

func (a *app) communityHotDealsPublished(ctx context.Context) (bool, error) {
	var published bool
	err := a.db.QueryRow(ctx, "select published from community_hotdeal_settings where id = 1").Scan(&published)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return published, err
}

func (a *app) loadPersistedCommunityHotDeals(ctx context.Context) ([]communityHotDealItem, time.Time, error) {
	rows, err := a.db.Query(ctx, `
		select source, source_label, title, summary, price, original_url, collected_at,
		       coalesce(published_at, collected_at), view_count, comment_count
		from community_hotdeal_items
		order by source asc, collected_at desc, original_url asc
	`)
	if err != nil {
		return nil, time.Time{}, err
	}
	defer rows.Close()
	items := make([]communityHotDealItem, 0)
	latest := time.Time{}
	for rows.Next() {
		var item communityHotDealItem
		var collectedAt time.Time
		var publishedAt time.Time
		if err := rows.Scan(&item.Source, &item.SourceLabel, &item.Title, &item.Summary, &item.Price, &item.OriginalURL, &collectedAt, &publishedAt, &item.ViewCount, &item.CommentCount); err != nil {
			return nil, time.Time{}, err
		}
		if !isCommunityHotDealCandidateTitle(item.Title) {
			continue
		}
		item.CollectedAt = collectedAt.UTC().Format(time.RFC3339)
		item.PublishedAt = publishedAt.UTC().Format(time.RFC3339)
		item.PopularityScore = communityHotDealPopularityScore(item.ViewCount, item.CommentCount)
		if collectedAt.After(latest) {
			latest = collectedAt
		}
		items = append(items, item)
	}
	return items, latest, rows.Err()
}

func (a *app) savePersistedCommunityHotDeals(ctx context.Context, items []communityHotDealItem) error {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "delete from community_hotdeal_items"); err != nil {
		return err
	}
	for _, item := range items {
		collectedAt, err := time.Parse(time.RFC3339, item.CollectedAt)
		if err != nil {
			collectedAt = time.Now().UTC()
		}
		if _, err := tx.Exec(ctx, `
			insert into community_hotdeal_items (original_url, source, source_label, title, summary, price, collected_at, published_at, view_count, comment_count)
			values ($1, $2, $3, $4, $5, $6, $7, nullif($8, '')::timestamptz, $9, $10)
		`, item.OriginalURL, item.Source, item.SourceLabel, item.Title, item.Summary, item.Price, collectedAt, item.PublishedAt, item.ViewCount, item.CommentCount); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (a *app) communityHotDealSnapshot(ctx context.Context, forceRefresh bool) communityHotDealResponse {
	communityHotDealCache.Lock()
	defer communityHotDealCache.Unlock()
	persistedItems, persistedAt, persistedErr := a.loadPersistedCommunityHotDeals(ctx)
	if persistedErr != nil {
		a.log.Warn("community hotdeal cache read failed", "error", persistedErr)
	}
	if communityHotDealCache.fetchedAt.IsZero() && len(persistedItems) > 0 {
		communityHotDealCache.response = communityHotDealResponse{
			Items:       persistedItems,
			Sources:     publicCommunityHotDealSources(),
			RefreshedAt: persistedAt.UTC().Format(time.RFC3339),
		}
		communityHotDealCache.fetchedAt = persistedAt
	}
	if forceRefresh || communityHotDealCache.fetchedAt.IsZero() || time.Since(communityHotDealCache.fetchedAt) >= 30*time.Minute {
		itemsBySource := make([][]communityHotDealItem, len(communityHotDealSources))
		type sourceResult struct {
			index int
			items []communityHotDealItem
		}
		// Never let a single public source hold the shared cache lock forever.
		// Only the current collection window is published; delayed sources are
		// retried in the next 30-minute collection cycle.
		results := make(chan sourceResult, len(communityHotDealSources))
		started := 0
		for index, source := range communityHotDealSources {
			if !source.CollectionEnabled {
				continue
			}
			started++
			go func(sourceIndex int, itemSource communityHotDealSource) {
				items := fetchCommunityHotDealLinks(ctx, itemSource)
				// Some community listings can return an empty response under parallel load.
				// Retry once with an independent timeout so a transient response does not
				// remove an otherwise available source such as Quasarzone.
				if len(items) == 0 {
					retryContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
					items = fetchCommunityHotDealLinks(retryContext, itemSource)
					cancel()
				}
				results <- sourceResult{index: sourceIndex, items: items}
			}(index, source)
		}
		deadline := time.NewTimer(20 * time.Second)
		for completed := 0; completed < started; {
			select {
			case result := <-results:
				itemsBySource[result.index] = result.items
				completed++
			case <-deadline.C:
				completed = started
			}
		}
		if !deadline.Stop() {
			select {
			case <-deadline.C:
			default:
			}
		}
		items := make([]communityHotDealItem, 0, len(communityHotDealSources)*12)
		for _, sourceItems := range itemsBySource {
			items = append(items, sourceItems...)
		}
		communityHotDealCache.response = communityHotDealResponse{
			Items:       items,
			Sources:     publicCommunityHotDealSources(),
			RefreshedAt: time.Now().UTC().Format(time.RFC3339),
		}
		communityHotDealCache.fetchedAt = time.Now()
		persistContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := a.savePersistedCommunityHotDeals(persistContext, items); err != nil {
			a.log.Warn("community hotdeal cache save failed", "error", err)
		}
		cancel()
	}
	return communityHotDealCache.response
}

func (a *app) listCommunityHotDeals(w http.ResponseWriter, r *http.Request, user authUser) {
	published, err := a.communityHotDealsPublished(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "hot-deal publication read failed")
		return
	}
	if !published && !user.PlatformAdmin {
		writeJSON(w, http.StatusOK, unpublishedCommunityHotDeals())
		return
	}
	response := a.communityHotDealSnapshot(r.Context(), false)
	if keyword := strings.TrimSpace(r.URL.Query().Get("q")); keyword != "" {
		searchContext, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		response.Items = mergeCommunityHotDealItems(response.Items, a.searchPpomppuHotDeals(searchContext, keyword))
		cancel()
	}
	response.Published = published
	writeJSON(w, http.StatusOK, response)
}

func (a *app) adminCommunityHotDeals(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	published, err := a.communityHotDealsPublished(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "hot-deal publication read failed")
		return
	}
	response := a.communityHotDealSnapshot(r.Context(), r.URL.Query().Get("refresh") == "true")
	response.Published = published
	writeJSON(w, http.StatusOK, response)
}

func (a *app) updateCommunityHotDealsPublished(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	var req struct {
		Published bool `json:"published"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if _, err := a.db.Exec(r.Context(), `
		insert into community_hotdeal_settings (id, published, updated_by_user_id, updated_at)
		values (1, $1, $2, now())
		on conflict (id) do update
		set published = excluded.published, updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at
	`, req.Published, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "hot-deal publication save failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"published": req.Published})
}

func setCommunityHotDealRequestHeaders(request *http.Request) {
	// Several public community boards reject unknown bot user agents while
	// allowing their ordinary public listing page in a browser. Use a stable
	// browser-identification header and only request the public source URL.
	request.Header.Set("User-Agent", "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36")
	request.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	request.Header.Set("Accept-Language", "ko-KR,ko;q=0.9,en;q=0.8")
}

func fetchCommunityHotDealListingWithWget(ctx context.Context, listingURL string) ([]byte, bool) {
	// Some public boards currently reject Go's TLS fingerprint but serve the
	// exact same public listing to the standard Alpine/BusyBox HTTP client that
	// ships in the API image. This is a fallback for a failed public request;
	// listingURL is always an application-owned source configuration value.
	command := exec.CommandContext(ctx, "wget", "-qO-", "--timeout=10", listingURL)
	body, err := command.Output()
	return body, err == nil && len(body) > 0
}

func communityHotDealListingURLs(source communityHotDealSource) []string {
	pages := max(1, source.ListingPages)
	urls := make([]string, 0, pages)
	for page := 1; page <= pages; page++ {
		listingURL, err := url.Parse(source.ListingURL)
		if err != nil {
			continue
		}
		if page > 1 {
			query := listingURL.Query()
			query.Set("page", strconv.Itoa(page))
			listingURL.RawQuery = query.Encode()
		}
		urls = append(urls, listingURL.String())
	}
	return urls
}

// Ppomppu keeps useful deals in its searchable archive for far longer than the
// short rolling list collected every 30 minutes. Search that public archive on
// demand so deals that have moved off the latest listing can still be found.
func (a *app) searchPpomppuHotDeals(ctx context.Context, keyword string) []communityHotDealItem {
	var source *communityHotDealSource
	for index := range communityHotDealSources {
		if communityHotDealSources[index].Key == "ppomppu" {
			source = &communityHotDealSources[index]
			break
		}
	}
	if source == nil {
		return nil
	}

	searchURL, ok := communityHotDealSearchURL(*source, keyword)
	if !ok {
		return nil
	}
	items := fetchCommunityHotDealListing(ctx, searchURL, *source)
	for index := range items {
		items[index] = enrichCommunityHotDealItem(ctx, items[index])
	}
	return items
}

func communityHotDealSearchURL(source communityHotDealSource, keyword string) (string, bool) {
	parsed, err := url.Parse(source.ListingURL)
	if err != nil {
		return "", false
	}
	query := parsed.Query()
	query.Set("search_type", "subject")
	query.Set("page", "1")
	query.Del("keyword")

	// Ppomppu expects the legacy CP949 query encoding. QueryEscape on those
	// bytes retains Korean text while keeping a safe request URL.
	encodedKeyword, err := korean.EUCKR.NewEncoder().Bytes([]byte(keyword))
	if err != nil {
		return "", false
	}
	parsed.RawQuery = query.Encode() + "&keyword=" + url.QueryEscape(string(encodedKeyword))
	return parsed.String(), true
}

func mergeCommunityHotDealItems(primary []communityHotDealItem, additional []communityHotDealItem) []communityHotDealItem {
	merged := make([]communityHotDealItem, 0, len(primary)+len(additional))
	seen := make(map[string]bool, len(primary)+len(additional))
	for _, item := range append(primary, additional...) {
		if item.OriginalURL == "" || seen[item.OriginalURL] {
			continue
		}
		seen[item.OriginalURL] = true
		merged = append(merged, item)
	}
	return merged
}

func fetchCommunityHotDealListing(ctx context.Context, listingURL string, source communityHotDealSource) []communityHotDealItem {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, listingURL, nil)
	if err != nil {
		return nil
	}
	setCommunityHotDealRequestHeaders(request)
	response, err := communityHotDealHTTPClient.Do(request)
	body := []byte(nil)
	contentType := ""
	if err == nil && response != nil {
		defer response.Body.Close()
		if response.StatusCode == http.StatusOK {
			body, err = io.ReadAll(io.LimitReader(response.Body, 3<<20))
			if err == nil {
				contentType = response.Header.Get("Content-Type")
			}
		}
	}
	if len(body) == 0 {
		var ok bool
		body, ok = fetchCommunityHotDealListingWithWget(ctx, listingURL)
		if !ok {
			return nil
		}
	}
	base, err := url.Parse(listingURL)
	if err != nil {
		return nil
	}
	items := extractCommunityHotDealLinks(decodeCommunityHotDealDocument(body, contentType), base, source, time.Now().UTC())
	if len(items) == 0 {
		if fallbackBody, ok := fetchCommunityHotDealListingWithWget(ctx, listingURL); ok {
			items = extractCommunityHotDealLinks(decodeCommunityHotDealDocument(fallbackBody, ""), base, source, time.Now().UTC())
		}
	}
	return items
}

func fetchCommunityHotDealLinks(ctx context.Context, source communityHotDealSource) []communityHotDealItem {
	fetchContext, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	items := make([]communityHotDealItem, 0, max(12, source.MaxItemsPerPage*max(1, source.ListingPages)))
	for _, listingURL := range communityHotDealListingURLs(source) {
		items = append(items, fetchCommunityHotDealListing(fetchContext, listingURL, source)...)
	}
	items = deduplicateCommunityHotDealItems(items)
	if len(items) == 0 {
		return items
	}
	enrichmentCount := len(items)
	if source.MaxItemsPerPage > 0 {
		enrichmentCount = min(enrichmentCount, source.MaxItemsPerPage)
	}
	var waitGroup sync.WaitGroup
	semaphore := make(chan struct{}, 4)
	for index := 0; index < enrichmentCount; index++ {
		waitGroup.Add(1)
		go func(itemIndex int) {
			defer waitGroup.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()
			items[itemIndex] = enrichCommunityHotDealItem(fetchContext, items[itemIndex])
		}(index)
	}
	waitGroup.Wait()
	return deduplicateCommunityHotDealItems(items)
}

func isCommunityHotDealCandidateTitle(title string) bool {
	title = strings.TrimSpace(title)
	return title != "" && !communityHotDealNoticeTitlePattern.MatchString(title)
}

func extractCommunityHotDealLinks(document string, base *url.URL, source communityHotDealSource, collectedAt time.Time) []communityHotDealItem {
	seen := map[string]bool{}
	maxItems := source.MaxItemsPerPage
	if maxItems <= 0 {
		maxItems = 12
	}
	items := make([]communityHotDealItem, 0, maxItems)
	for _, match := range communityHotDealAnchorPattern.FindAllStringSubmatchIndex(document, -1) {
		if len(match) < 6 || len(items) >= maxItems {
			break
		}
		rawURL := strings.TrimSpace(html.UnescapeString(document[match[2]:match[3]]))
		link, err := base.Parse(rawURL)
		if err != nil || link.Scheme != "https" || source.allowedPath == nil || !source.allowedPath(link) {
			continue
		}
		canonical := canonicalCommunityHotDealURL(link)
		rawTitle := normalizeCommunityHotDealText(document[match[4]:match[5]], 0)
		title := normalizeCommunityHotDealText(rawTitle, 180)
		if !isCommunityHotDealCandidateTitle(title) {
			// Quasarzone has an image-only link before the subject link for the
			// same article. Keep the URL available for the later subject link.
			continue
		}
		if seen[canonical] {
			continue
		}
		seen[canonical] = true
		// 제목 말미에 가격이 붙는 출처가 있어, 화면용 제목을 줄이기 전에 원문 전체에서 가격을 찾는다.
		price := extractCommunityHotDealPrice(rawTitle)
		if price == "" {
			// Most boards render a title and amount in neighbouring elements of
			// one list row. Keep the search window small to avoid nearby rows.
			start := max(0, match[0]-180)
			end := min(len(document), match[1]+360)
			price = extractCommunityHotDealPrice(normalizeCommunityHotDealText(document[start:end], 700))
		}
		items = append(items, communityHotDealItem{
			Source: source.Key, SourceLabel: source.Label, Title: title, Price: price, OriginalURL: canonical, CollectedAt: collectedAt.Format(time.RFC3339),
		})
	}
	return items
}

func canonicalCommunityHotDealURL(link *url.URL) string {
	canonical := *link
	canonical.Fragment = ""
	query := canonical.Query()
	for key := range query {
		switch key {
		case "id", "no", "bo_table", "wr_id":
			// These keys identify an article on the sources that use query URLs.
		default:
			query.Del(key)
		}
	}
	canonical.RawQuery = query.Encode()
	return canonical.String()
}

func deduplicateCommunityHotDealItems(items []communityHotDealItem) []communityHotDealItem {
	seenURLs := make(map[string]bool, len(items))
	seenContent := make(map[string]bool, len(items))
	unique := make([]communityHotDealItem, 0, len(items))
	for _, item := range items {
		urlKey := strings.TrimSpace(item.OriginalURL)
		contentKey := strings.ToLower(strings.Join([]string{
			strings.TrimSpace(item.Source),
			strings.TrimSpace(item.Title),
			strings.TrimSpace(item.Price),
		}, "\n"))
		if (urlKey != "" && seenURLs[urlKey]) || (strings.TrimSpace(item.Title) != "" && seenContent[contentKey]) {
			continue
		}
		if urlKey != "" {
			seenURLs[urlKey] = true
		}
		if strings.TrimSpace(item.Title) != "" {
			seenContent[contentKey] = true
		}
		unique = append(unique, item)
	}
	return unique
}

func communityHotDealContentURL(originalURL string) string {
	link, err := url.Parse(originalURL)
	if err != nil || link.Host != "www.ppomppu.co.kr" || link.Path != "/zboard/view.php" || link.Query().Get("id") == "" || link.Query().Get("no") == "" {
		return originalURL
	}
	// 뽐뿌 PC 원문은 모바일 페이지로 자바스크립트 리다이렉트만 돌려준다.
	// 수집기는 자바스크립트를 실행하지 않으므로 실제 본문·가격이 있는 모바일 원문을 직접 요청한다.
	link.Host = "m.ppomppu.co.kr"
	link.Path = "/new/bbs_view.php"
	query := link.Query()
	query.Set("extref", "1")
	link.RawQuery = query.Encode()
	return link.String()
}

func enrichCommunityHotDealItem(ctx context.Context, item communityHotDealItem) communityHotDealItem {
	contentURL := communityHotDealContentURL(item.OriginalURL)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, contentURL, nil)
	if err != nil {
		return item
	}
	setCommunityHotDealRequestHeaders(request)
	response, err := communityHotDealHTTPClient.Do(request)
	body := []byte(nil)
	contentType := ""
	if err == nil && response != nil {
		defer response.Body.Close()
		if response.StatusCode == http.StatusOK {
			body, err = io.ReadAll(io.LimitReader(response.Body, 1<<20))
			if err == nil {
				contentType = response.Header.Get("Content-Type")
			}
		}
	}
	if len(body) == 0 {
		var ok bool
		body, ok = fetchCommunityHotDealListingWithWget(ctx, contentURL)
		if !ok {
			return item
		}
	}
	document := decodeCommunityHotDealDocument(body, contentType)
	if title := communityHotDealMetaContent(document, "og:title", "twitter:title"); title != "" {
		item.Title = normalizeCommunityHotDealText(title, 180)
	}
	if summary := communityHotDealMetaContent(document, "og:description", "description", "twitter:description"); summary != "" {
		item.Summary = normalizeCommunityHotDealText(summary, 180)
	}
	if price := extractCommunityHotDealPrice(strings.Join([]string{item.Title, item.Summary}, " ")); price != "" {
		item.Price = price
	}
	if item.Price == "" {
		item.Price = extractCommunityHotDealPrice(communityHotDealMetaContent(document, "product:price:amount", "og:price:amount", "product:price", "price"))
	}
	if item.Price == "" {
		item.Price = extractCommunityHotDealPrice(normalizeCommunityHotDealText(document, 12000))
	}
	item.ViewCount, item.CommentCount, item.PublishedAt = extractCommunityHotDealMetrics(document, item.CollectedAt)
	item.PopularityScore = communityHotDealPopularityScore(item.ViewCount, item.CommentCount)
	return item
}

func communityHotDealPopularityScore(viewCount, commentCount int64) int64 {
	// 댓글은 단순 노출보다 참여도가 높으므로 인기순 계산에서 가중치를 둡니다.
	return viewCount + commentCount*20
}

func extractCommunityHotDealMetrics(document, fallbackPublishedAt string) (int64, int64, string) {
	plainText := normalizeCommunityHotDealText(document, 0)
	viewCount := extractCommunityHotDealCount(communityHotDealViewCountPattern, plainText)
	commentCount := extractCommunityHotDealCount(communityHotDealCommentCountPattern, plainText)
	publishedAt := ""
	for _, value := range []string{
		communityHotDealMetaContent(document, "article:published_time", "og:published_time", "date", "datepublished", "datepublishedtime"),
		plainText,
	} {
		if parsed, ok := parseCommunityHotDealPublishedAt(value); ok {
			publishedAt = parsed.UTC().Format(time.RFC3339)
			break
		}
	}
	if publishedAt == "" {
		publishedAt = fallbackPublishedAt
	}
	return viewCount, commentCount, publishedAt
}

func extractCommunityHotDealCount(pattern *regexp.Regexp, value string) int64 {
	match := pattern.FindStringSubmatch(value)
	if len(match) < 2 {
		return 0
	}
	count, err := strconv.ParseInt(strings.ReplaceAll(match[1], ",", ""), 10, 64)
	if err != nil || count < 0 {
		return 0
	}
	return count
}

func parseCommunityHotDealPublishedAt(value string) (time.Time, bool) {
	match := communityHotDealPublishedAtPattern.FindStringSubmatch(value)
	if len(match) < 4 {
		return time.Time{}, false
	}
	year, _ := strconv.Atoi(match[1])
	month, _ := strconv.Atoi(match[2])
	day, _ := strconv.Atoi(match[3])
	hour, minute, second := 0, 0, 0
	if len(match) >= 6 && match[4] != "" {
		hour, _ = strconv.Atoi(match[4])
		minute, _ = strconv.Atoi(match[5])
	}
	if len(match) >= 7 && match[6] != "" {
		second, _ = strconv.Atoi(match[6])
	}
	parsed := time.Date(year, time.Month(month), day, hour, minute, second, 0, time.FixedZone("KST", 9*60*60))
	if parsed.Year() != year || int(parsed.Month()) != month || parsed.Day() != day {
		return time.Time{}, false
	}
	return parsed, true
}

func decodeCommunityHotDealDocument(body []byte, contentType string) string {
	charset := ""
	if _, params, err := mime.ParseMediaType(contentType); err == nil {
		charset = strings.ToLower(strings.TrimSpace(params["charset"]))
	}
	if charset == "" {
		headerLength := min(len(body), 8192)
		if match := communityHotDealCharsetPattern.FindStringSubmatch(string(body[:headerLength])); len(match) >= 2 {
			charset = strings.ToLower(strings.TrimSpace(match[1]))
		}
	}
	legacyKoreanEncoding := charset == "euc-kr" || charset == "euckr" || charset == "cp949" || charset == "windows-949" || charset == "x-windows-949" || charset == "ks_c_5601-1987"
	if legacyKoreanEncoding || !utf8.Valid(body) {
		if decoded, err := korean.EUCKR.NewDecoder().Bytes(body); err == nil && utf8.Valid(decoded) {
			return string(decoded)
		}
	}
	return string(body)
}

func communityHotDealMetaContent(document string, names ...string) string {
	wanted := map[string]bool{}
	for _, name := range names {
		wanted[strings.ToLower(name)] = true
	}
	for _, tag := range communityHotDealMetaTagPattern.FindAllString(document, -1) {
		attributes := map[string]string{}
		for _, match := range communityHotDealAttributePattern.FindAllStringSubmatch(tag, -1) {
			if len(match) >= 3 {
				attributes[strings.ToLower(match[1])] = html.UnescapeString(strings.TrimSpace(match[2]))
			}
		}
		name := strings.ToLower(attributes["property"])
		if name == "" {
			name = strings.ToLower(attributes["name"])
		}
		if wanted[name] && attributes["content"] != "" {
			return attributes["content"]
		}
	}
	return ""
}

func normalizeCommunityHotDealText(value string, limit int) string {
	value = html.UnescapeString(value)
	value = communityHotDealTagPattern.ReplaceAllString(value, " ")
	value = communityHotDealWhitespacePattern.ReplaceAllString(strings.TrimSpace(value), " ")
	if limit > 0 && len([]rune(value)) > limit {
		return string([]rune(value)[:limit]) + "…"
	}
	return value
}

func extractCommunityHotDealPrice(value string) string {
	if price := strings.TrimSpace(communityHotDealPricePattern.FindString(value)); price != "" {
		return price
	}
	// 뽐뿌 등은 "53,000/무료"처럼 원 단위 없이 가격과 배송 조건만 표시하기도 한다.
	// 이 경우에도 금액으로 인식해 화면에서 누락되지 않게 한다.
	if match := communityHotDealSlashPricePattern.FindStringSubmatch(value); len(match) > 1 {
		return match[1] + "원"
	}
	return ""
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
	IsPrivate       bool     `json:"isPrivate"`
	CommentsEnabled bool     `json:"commentsEnabled"`
	ViewCount       int64    `json:"viewCount"`
	LikeCount       int64    `json:"likeCount"`
	DislikeCount    int64    `json:"dislikeCount"`
	MyReaction      string   `json:"myReaction,omitempty"`
	PeriodViewCount int64    `json:"periodViewCount,omitempty"`
	CreatedAt       string   `json:"createdAt"`
	UpdatedAt       string   `json:"updatedAt"`
}

type communityCommentItem struct {
	ID              int64  `json:"id"`
	PostID          int64  `json:"postId"`
	ParentCommentID *int64 `json:"parentCommentId,omitempty"`
	AuthorID        *int64 `json:"authorId,omitempty"`
	AuthorName      string `json:"authorName"`
	Body            string `json:"body"`
	IsDeleted       bool   `json:"isDeleted,omitempty"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type communityPostPage struct {
	Items    []communityPostItem `json:"items"`
	Total    int                 `json:"total"`
	Page     int                 `json:"page"`
	PageSize int                 `json:"pageSize"`
}

func (a *app) listCommunityPosts(w http.ResponseWriter, r *http.Request, user authUser) {
	board, ok := normalizeBoard(w, r.URL.Query().Get("boardType"))
	if !ok || !a.requireBoardRead(w, user, board) {
		return
	}
	familyID := queryInt64(r, "familyId", 0)
	where := "where board_type = $1 and deleted_at is null"
	args := []any{board}
	if board == "inquiry" && !user.PlatformAdmin {
		where += " and coalesce(is_private,false) = false"
	}
	if familyID > 0 && board != "free" && board != "notice" {
		if !a.requireFamilyPermission(w, r.Context(), user, familyID, "read") {
			return
		}
		canShare := a.hasFamilyPermissionForMenu(r.Context(), user, familyID, "read", "community")
		base := len(args) + 1
		where += fmt.Sprintf(` and family_id = $%d and (
			author_id = $%d
			or ($%d = true and exists (
				select 1 from family_members owner
				where owner.family_id = $%d and owner.user_id = author_id and $%d = any(owner.shared_menu_keys)
			))
		)`, base, base+1, base+2, base, base+3)
		args = append(args, familyID, user.ID, canShare, "community")
	}
	if title := strings.TrimSpace(r.URL.Query().Get("title")); title != "" {
		args = append(args, "%"+strings.ToLower(title)+"%")
		where += fmt.Sprintf(" and lower(title) like $%d", len(args))
	}
	if author := strings.TrimSpace(r.URL.Query().Get("author")); author != "" {
		args = append(args, "%"+strings.ToLower(author)+"%")
		where += fmt.Sprintf(" and lower(author_name) like $%d", len(args))
	}
	if startDate := strings.TrimSpace(r.URL.Query().Get("startDate")); startDate != "" && validDate(startDate) {
		args = append(args, startDate)
		where += fmt.Sprintf(" and created_at::date >= $%d::date", len(args))
	}
	if endDate := strings.TrimSpace(r.URL.Query().Get("endDate")); endDate != "" && validDate(endDate) {
		args = append(args, endDate)
		where += fmt.Sprintf(" and created_at::date <= $%d::date", len(args))
	}
	var total int
	if err := a.db.QueryRow(r.Context(), "select count(*) from community_posts "+where, args...).Scan(&total); err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	page, pageSize := moderationPagination(r)
	totalPages := max(1, (total+pageSize-1)/pageSize)
	if page > totalPages {
		page = totalPages
	}
	sort := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("sort")))
	orderBy := "p.created_at desc, p.id desc"
	switch sort {
	case "oldest":
		orderBy = "p.created_at asc, p.id asc"
	case "likes":
		orderBy = "coalesce(reactions.like_count,0) desc, p.created_at desc, p.id desc"
	case "views":
		orderBy = "coalesce(p.view_count,0) desc, p.created_at desc, p.id desc"
	case "", "latest":
	default:
		writeError(w, http.StatusBadRequest, "invalid sort")
		return
	}
	query := `select p.id, p.board_type, p.family_id, p.author_id, p.author_name, p.title, p.body::text,
		coalesce(p.view_count,0), coalesce(p.is_private,false), coalesce(p.comments_enabled,true), p.created_at, p.updated_at,
		coalesce(reactions.like_count,0), coalesce(reactions.dislike_count,0), coalesce(my_reaction.reaction,'')
		from community_posts p
		left join lateral (
			select count(*) filter (where reaction = 'like') as like_count,
			       count(*) filter (where reaction = 'dislike') as dislike_count
			from community_post_reactions where community_post_id = p.id
		) reactions on true
		left join lateral (
			select reaction from community_post_reactions where community_post_id = p.id and user_id = $` + strconv.Itoa(len(args)+1) + `
		) my_reaction on true ` + strings.Replace(where, "where", "where", 1)
	query += fmt.Sprintf(" order by %s limit $%d offset $%d", orderBy, len(args)+2, len(args)+3)
	rows, err := a.db.Query(r.Context(), query, append(args, user.ID, pageSize, (page-1)*pageSize)...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items, ok := a.scanCommunityPosts(w, r.Context(), rows)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, communityPostPage{Items: items, Total: total, Page: page, PageSize: pageSize})
}

func (a *app) getCommunityPost(w http.ResponseWriter, r *http.Request, user authUser) {
	postID, ok := pathID(w, r, "postId")
	if !ok {
		return
	}
	post, ok := a.communityPostByID(w, r.Context(), postID, user.ID)
	if !ok || !a.requirePostRead(w, r.Context(), user, post) {
		return
	}
	a.recordCommunityPostView(r.Context(), postID, user.ID)
	post, ok = a.communityPostByID(w, r.Context(), postID, user.ID)
	if !ok {
		return
	}
	comments := []communityCommentItem{}
	if post.CommentsEnabled {
		var ok bool
		comments, ok = a.communityComments(w, r.Context(), postID)
		if !ok {
			return
		}
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
		       coalesce(p.view_count,0), coalesce(p.is_private,false), coalesce(p.comments_enabled,true), p.created_at, p.updated_at, coalesce(sum(v.view_count),0) as period_views
		from community_posts p
		left join community_post_view_stats v
		  on v.community_post_id = p.id
		 and v.view_date >= current_date - (($2::int - 1) * interval '1 day')
		where p.board_type = $1 and p.deleted_at is null
		  and (p.board_type <> 'inquiry' or coalesce(p.is_private,false) = false or $3 = true)
		group by p.id
		order by period_views desc, coalesce(p.view_count,0) desc, p.created_at desc
		limit 10
	`, board, days, user.PlatformAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()
	items := []communityPostItem{}
	for rows.Next() {
		var item communityPostItem
		var familyID, authorID sql.NullInt64
		var isPrivate, commentsEnabled bool
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&item.ID, &item.BoardType, &familyID, &authorID, &item.AuthorName, &item.Title, &item.Body, &item.ViewCount, &isPrivate, &commentsEnabled, &createdAt, &updatedAt, &item.PeriodViewCount); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return
		}
		item.FamilyID = nullInt64(familyID)
		item.AuthorID = nullInt64(authorID)
		item.IsPrivate = isPrivate
		item.CommentsEnabled = commentsEnabled
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
	old, ok := a.communityPostByID(w, r.Context(), postID, user.ID)
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
	post, ok := a.communityPostByID(w, r.Context(), postID, user.ID)
	if !ok || !a.requirePostWrite(w, user, post) {
		return
	}
	mediaURLs := a.mediaURLs(r.Context(), "community_post_media_urls", "community_post_id", postID)
	_, _ = a.db.Exec(r.Context(), "update community_comments set deleted_at = now(), updated_at = now() where post_id = $1 and deleted_at is null", postID)
	_, _ = a.db.Exec(r.Context(), "update community_posts set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null", postID)
	a.deleteUnusedMediaURLs(r.Context(), mediaURLs)
	var familyID int64
	if post.FamilyID != nil {
		familyID = *post.FamilyID
	}
	a.recordDataChange(r.Context(), "community_post", postID, familyID, user.ID, "delete", map[string]any{"id": postID})
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) reactToCommunityPost(w http.ResponseWriter, r *http.Request, user authUser) {
	postID, ok := pathID(w, r, "postId")
	if !ok {
		return
	}
	post, ok := a.communityPostByID(w, r.Context(), postID, user.ID)
	if !ok || !a.requirePostRead(w, r.Context(), user, post) {
		return
	}
	if post.BoardType != "free" {
		writeError(w, http.StatusForbidden, "reactions are available only on free posts")
		return
	}
	if post.AuthorID != nil && *post.AuthorID == user.ID {
		writeError(w, http.StatusBadRequest, "cannot react to your own post")
		return
	}
	var req struct {
		Reaction string `json:"reaction"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	req.Reaction = strings.ToLower(strings.TrimSpace(req.Reaction))
	if req.Reaction != "like" && req.Reaction != "dislike" {
		writeError(w, http.StatusBadRequest, "invalid reaction")
		return
	}
	var existing string
	err := a.db.QueryRow(r.Context(), "select reaction from community_post_reactions where community_post_id = $1 and user_id = $2", postID, user.ID).Scan(&existing)
	if err == nil && existing == req.Reaction {
		if _, err := a.db.Exec(r.Context(), "delete from community_post_reactions where community_post_id = $1 and user_id = $2", postID, user.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "reaction update failed")
			return
		}
	} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "reaction read failed")
		return
	} else if _, err := a.db.Exec(r.Context(), `
		insert into community_post_reactions (community_post_id, user_id, reaction, created_at, updated_at)
		values ($1, $2, $3, now(), now())
		on conflict (community_post_id, user_id)
		do update set reaction = excluded.reaction, updated_at = now()
	`, postID, user.ID, req.Reaction); err != nil {
		writeError(w, http.StatusInternalServerError, "reaction update failed")
		return
	}
	updated, ok := a.communityPostByID(w, r.Context(), postID, user.ID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *app) createCommunityComment(w http.ResponseWriter, r *http.Request, user authUser) {
	postID, ok := pathID(w, r, "postId")
	if !ok {
		return
	}
	post, ok := a.communityPostByID(w, r.Context(), postID, user.ID)
	if !ok || !a.requirePostRead(w, r.Context(), user, post) {
		return
	}
	if !post.CommentsEnabled {
		writeError(w, http.StatusForbidden, "comments are disabled for this post")
		return
	}
	if post.BoardType == "notice" && !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	var req struct {
		Body            string `json:"body"`
		ParentCommentID *int64 `json:"parentCommentId"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" {
		writeError(w, http.StatusBadRequest, "body is required")
		return
	}
	if utf8.RuneCountInString(req.Body) > maxCommunityCommentRunes {
		writeError(w, http.StatusBadRequest, "comment is too long")
		return
	}
	parentCommentID, parentAuthorID, ok := a.resolveCommunityCommentParent(w, r.Context(), postID, req.ParentCommentID)
	if !ok {
		return
	}
	var item communityCommentItem
	var authorID int64 = user.ID
	var returnedParentID sql.NullInt64
	var createdAt, updatedAt time.Time
	err := a.db.QueryRow(r.Context(), `
		insert into community_comments (post_id, parent_comment_id, author_id, author_name, body, created_at, updated_at)
		values ($1,$2,$3,$4,$5,now(),now())
		returning id, post_id, parent_comment_id, author_id, author_name, body::text, created_at, updated_at
	`, postID, parentCommentID, user.ID, a.displayName(r.Context(), user), req.Body).
		Scan(&item.ID, &item.PostID, &returnedParentID, &authorID, &item.AuthorName, &item.Body, &createdAt, &updatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "comment save failed")
		return
	}
	item.ParentCommentID = nullInt64(returnedParentID)
	item.AuthorID = &authorID
	item.CreatedAt = formatTime(createdAt)
	item.UpdatedAt = formatTime(updatedAt)
	var familyID int64
	if post.FamilyID != nil {
		familyID = *post.FamilyID
	}
	a.recordDataChange(r.Context(), "community_comment", item.ID, familyID, user.ID, "create", item)
	a.notifyCommunityComment(r.Context(), post, item, parentAuthorID, user.ID)
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
	if !readJSON(w, r, &req) {
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" {
		writeError(w, http.StatusBadRequest, "body is required")
		return
	}
	if utf8.RuneCountInString(req.Body) > maxCommunityCommentRunes {
		writeError(w, http.StatusBadRequest, "comment is too long")
		return
	}
	var item communityCommentItem
	var parentCommentID, authorID sql.NullInt64
	var createdAt, updatedAt time.Time
	err := a.db.QueryRow(r.Context(), `
		update community_comments set body=$1, updated_at=now() where id=$2 and deleted_at is null
		returning id, post_id, parent_comment_id, author_id, author_name, body::text, created_at, updated_at
	`, req.Body, commentID).Scan(&item.ID, &item.PostID, &parentCommentID, &authorID, &item.AuthorName, &item.Body, &createdAt, &updatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "comment save failed")
		return
	}
	item.ParentCommentID = nullInt64(parentCommentID)
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
	// maxMemory는 파일 제한이 아니라 메모리 대신 임시 파일을 쓰기 시작하는 기준입니다.
	// 파일 크기 정책은 아래 mediaSizeLimitsEnabled에서만 적용합니다.
	if err := r.ParseMultipartForm(8 << 20); err != nil {
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
		if a.cfg.mediaSizeLimitsEnabled {
			limit = a.cfg.maxImageBytes
		}
	} else if strings.HasPrefix(lowerType, "video/") {
		if a.cfg.mediaSizeLimitsEnabled {
			limit = a.cfg.maxVideoBytes
		}
	} else {
		writeError(w, http.StatusUnsupportedMediaType, "only image and video files are allowed")
		return
	}
	if limit > 0 && (user.PlatformAdmin || a.userMediaFileSizeUnlimited(r.Context(), user.ID)) {
		limit = 0
	}
	if limit > 0 && header.Size > limit {
		writeError(w, http.StatusRequestEntityTooLarge, "file is too large")
		return
	}
	fileSource := io.Reader(file)
	if limit > 0 {
		fileSource = io.LimitReader(file, limit+1)
	}
	fileData, err := io.ReadAll(fileSource)
	if err != nil {
		writeError(w, http.StatusBadRequest, "file read failed")
		return
	}
	if limit > 0 && int64(len(fileData)) > limit {
		writeError(w, http.StatusRequestEntityTooLarge, "file is too large")
		return
	}
	var uploadTx pgx.Tx
	if user.ID > 0 && a.cfg.mediaUserQuotaBytes > 0 {
		uploadTx, err = a.beginMediaUpload(r.Context(), user.ID, int64(len(fileData)))
		if errors.Is(err, errUserMediaQuotaExceeded) {
			writeError(w, http.StatusRequestEntityTooLarge, "user media storage quota exceeded")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "media storage quota check failed")
			return
		}
		defer uploadTx.Rollback(r.Context())
	}
	storedName := newSessionID() + safeExtension(header.Filename)
	written, err := a.mediaStore.Save(r.Context(), storedName, bytes.NewReader(fileData), contentType, limit)
	if (limit > 0 && errors.Is(err, errMediaTooLarge)) || (limit > 0 && written > limit) {
		writeError(w, http.StatusRequestEntityTooLarge, "file is too large")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "file save failed")
		return
	}
	if strings.HasPrefix(lowerType, "image/") {
		if thumbnail, thumbnailErr := makeMediaThumbnail(bytes.NewReader(fileData)); thumbnailErr == nil {
			if _, saveErr := a.mediaStore.Save(r.Context(), mediaThumbnailName(storedName), bytes.NewReader(thumbnail), "image/jpeg", mediaThumbnailMaxBytes); saveErr != nil {
				a.log.Warn("media thumbnail save failed", "error", saveErr, "file", storedName)
			}
		} else {
			a.log.Warn("media thumbnail create failed", "error", thumbnailErr, "file", storedName)
		}
		if display, displayErr := makeMediaDisplay(bytes.NewReader(fileData)); displayErr == nil {
			if _, saveErr := a.mediaStore.Save(r.Context(), mediaDisplayName(storedName), bytes.NewReader(display), "image/jpeg", mediaDisplayMaxBytes); saveErr != nil {
				a.log.Warn("media display variant save failed", "error", saveErr, "file", storedName)
			}
		} else {
			a.log.Warn("media display variant create failed", "error", displayErr, "file", storedName)
		}
	}
	if uploadTx != nil {
		if _, err := uploadTx.Exec(r.Context(), `
			insert into media_files (storage_key, uploaded_by_user_id, byte_size, content_type, created_at)
			values ($1, $2, $3, $4, now())
		`, storedName, user.ID, written, contentType); err != nil {
			_ = a.mediaStore.Delete(r.Context(), storedName)
			_ = a.mediaStore.Delete(r.Context(), mediaThumbnailName(storedName))
			_ = a.mediaStore.Delete(r.Context(), legacyMediaThumbnailName(storedName))
			_ = a.mediaStore.Delete(r.Context(), mediaDisplayName(storedName))
			writeError(w, http.StatusInternalServerError, "media usage save failed")
			return
		}
		if err := uploadTx.Commit(r.Context()); err != nil {
			_ = a.mediaStore.Delete(r.Context(), storedName)
			_ = a.mediaStore.Delete(r.Context(), mediaThumbnailName(storedName))
			_ = a.mediaStore.Delete(r.Context(), legacyMediaThumbnailName(storedName))
			_ = a.mediaStore.Delete(r.Context(), mediaDisplayName(storedName))
			writeError(w, http.StatusInternalServerError, "media usage save failed")
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"url":              a.cfg.mediaPublicPrefix + "/" + storedName,
		"storedFileName":   storedName,
		"originalFileName": header.Filename,
		"contentType":      contentType,
		"size":             written,
	})
}

func (a *app) userMediaFileSizeUnlimited(ctx context.Context, userID int64) bool {
	if userID <= 0 {
		return false
	}
	var unlimited bool
	if err := a.db.QueryRow(ctx, "select media_file_size_unlimited from app_users where id = $1 and deleted_at is null", userID).Scan(&unlimited); err != nil {
		a.log.Warn("media file size policy read failed", "error", err, "userId", userID)
		return false
	}
	return unlimited
}

// beginMediaUpload serializes a user's uploads so parallel requests cannot exceed the quota.
// Accounts explicitly marked unlimited by a platform administrator bypass only the total quota.
func (a *app) beginMediaUpload(ctx context.Context, userID, newBytes int64) (pgx.Tx, error) {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, "select pg_advisory_xact_lock($1)", userID); err != nil {
		tx.Rollback(ctx)
		return nil, err
	}
	var unlimited, platformAdmin bool
	if err := tx.QueryRow(ctx, "select media_storage_unlimited, platform_admin from app_users where id = $1 and deleted_at is null", userID).Scan(&unlimited, &platformAdmin); err != nil {
		tx.Rollback(ctx)
		return nil, err
	}
	if unlimited || platformAdmin {
		return tx, nil
	}
	var usedBytes int64
	if err := tx.QueryRow(ctx, "select coalesce(sum(byte_size), 0) from media_files where uploaded_by_user_id = $1 and deleted_at is null", userID).Scan(&usedBytes); err != nil {
		tx.Rollback(ctx)
		return nil, err
	}
	if newBytes > a.cfg.mediaUserQuotaBytes-usedBytes {
		tx.Rollback(ctx)
		return nil, errUserMediaQuotaExceeded
	}
	return tx, nil
}

func (a *app) downloadMedia(w http.ResponseWriter, r *http.Request) {
	fileName := r.PathValue("fileName")
	if fileName == "" {
		writeError(w, http.StatusBadRequest, "invalid file name")
		return
	}
	file, contentType, err := a.openRequestedMedia(r.Context(), fileName, r.URL.Query().Get("variant"))
	if err != nil {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	defer file.Close()
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	// Media file names are random and never overwritten, so clients can cache originals and image variants safely.
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("Content-Disposition", "inline; filename=\""+strings.ReplaceAll(fileName, "\"", "")+"\"")
	_, _ = io.Copy(w, file)
}

func (a *app) deleteBabyPhotoIfUnused(ctx context.Context, mediaURL string, _ int64) {
	a.deleteMediaIfUnused(ctx, mediaURL)
}

type notificationItem struct {
	ID                 int64   `json:"id"`
	UserID             int64   `json:"userId"`
	FamilyID           int64   `json:"familyId"`
	ScheduleID         *int64  `json:"scheduleId,omitempty"`
	CommunityPostID    *int64  `json:"communityPostId,omitempty"`
	CommunityCommentID *int64  `json:"communityCommentId,omitempty"`
	Type               string  `json:"type"`
	Title              string  `json:"title"`
	Body               string  `json:"body"`
	TargetDate         string  `json:"targetDate"`
	ReadAt             *string `json:"readAt,omitempty"`
	CreatedAt          string  `json:"createdAt"`
}

func (a *app) sendPushToUser(ctx context.Context, userID int64, title, body string) {
	a.sendPushToUserWithData(ctx, userID, title, body, nil)
}

func (a *app) sendPushToUserWithData(ctx context.Context, userID int64, title, body string, data map[string]string) {
	path := strings.TrimSpace(a.cfg.firebaseServiceAccountPath)
	if path == "" || strings.TrimSpace(a.cfg.firebaseProjectID) == "" {
		return
	}
	credentials, err := os.ReadFile(path)
	if err != nil {
		a.log.Warn("fcm credentials unavailable", "error", err)
		return
	}
	jwtConfig, err := google.JWTConfigFromJSON(credentials, "https://www.googleapis.com/auth/firebase.messaging")
	if err != nil {
		a.log.Warn("fcm credentials invalid", "error", err)
		return
	}
	rows, err := a.db.Query(ctx, "select token from push_devices where user_id = $1 and active = true", userID)
	if err != nil {
		return
	}
	defer rows.Close()
	client := jwtConfig.Client(ctx)
	endpoint := "https://fcm.googleapis.com/v1/projects/" + url.PathEscape(a.cfg.firebaseProjectID) + "/messages:send"
	for rows.Next() {
		var token string
		if rows.Scan(&token) != nil {
			continue
		}
		message := map[string]any{"token": token, "notification": map[string]string{"title": title, "body": body}, "android": map[string]any{"priority": "high"}}
		if len(data) > 0 {
			message["data"] = data
		}
		payload, _ := json.Marshal(map[string]any{"message": message})
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
		if err != nil {
			continue
		}
		request.Header.Set("Content-Type", "application/json")
		response, err := client.Do(request)
		if err != nil {
			continue
		}
		if response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusBadRequest {
			_, _ = a.db.Exec(ctx, "update push_devices set active = false, updated_at = now() where token = $1", token)
		}
		response.Body.Close()
	}
}

func (a *app) listNotifications(w http.ResponseWriter, r *http.Request, user authUser) {
	unreadOnly := r.URL.Query().Get("unreadOnly") != "false"
	query := `select id, user_id, family_id, schedule_id, community_post_id, community_comment_id, type, title, body, target_date, read_at, created_at from app_notifications where user_id = $1`
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
			select id, title, coalesce(to_char(schedule_time, 'HH24:MI'), ''), coalesce(category, '일정')
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
					values ($1,$2,$3,'SCHEDULE_REMINDER','오늘 일정이 있습니다.', $4, $5, now())
					on conflict (user_id, schedule_id, type, target_date) do nothing
				`, userID, familyID, scheduleID, bodyTime+" · "+title+" · "+category, targetDate)
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

func koreanLocation() *time.Location {
	location, err := time.LoadLocation("Asia/Seoul")
	if err != nil {
		return time.FixedZone("Asia/Seoul", 9*60*60)
	}
	return location
}

func (a *app) startScheduleTimePushJob(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if _, err := a.dispatchScheduleTimePushes(context.Background(), time.Now().In(koreanLocation())); err != nil {
					a.log.Error("schedule time push failed", "error", err)
				}
			}
		}
	}()
}

func (a *app) dispatchScheduleTimePushes(ctx context.Context, now time.Time) (int64, error) {
	targetDate := now.Format("2006-01-02")
	targetTime := now.Format("15:04")
	rows, err := a.db.Query(ctx, `
		select distinct s.id, fm.user_id, s.title
		from family_schedules s
		join family_members fm on fm.family_id = s.family_id and fm.can_read = true
		where s.deleted_at is null
		  and s.push_enabled = true
		  and s.schedule_time is not null
		  and to_char(s.schedule_time, 'HH24:MI') = $1
		  and (
				s.schedule_date = $2::date
				or (coalesce(s.repeat_rule, 'none') = 'weekly' and s.schedule_date <= $2::date and mod(($2::date - s.schedule_date), 7) = 0)
				or (coalesce(s.repeat_rule, 'none') = 'monthly' and s.schedule_date <= $2::date and extract(day from s.schedule_date) = extract(day from $2::date))
				or (coalesce(s.repeat_rule, 'none') = 'yearly' and s.schedule_date <= $2::date and extract(month from s.schedule_date) = extract(month from $2::date) and extract(day from s.schedule_date) = extract(day from $2::date))
			  )
		  and not exists (
				select 1 from family_schedule_exceptions e where e.schedule_id = s.id and e.occurrence_date = $2::date
			  )
	`, targetTime, targetDate)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var sent int64
	for rows.Next() {
		var scheduleID, userID int64
		var title string
		if err := rows.Scan(&scheduleID, &userID, &title); err != nil {
			return sent, err
		}
		tag, err := a.db.Exec(ctx, `
			insert into schedule_push_deliveries (user_id, schedule_id, delivery_type, target_date)
			values ($1, $2, 'SCHEDULE_TIME', $3)
			on conflict (user_id, schedule_id, delivery_type, target_date) do nothing
		`, userID, scheduleID, targetDate)
		if err != nil {
			return sent, err
		}
		if tag.RowsAffected() == 0 {
			continue
		}
		a.sendPushToUser(ctx, userID, "일정 알림", targetTime+" · "+title)
		sent++
	}
	return sent, rows.Err()
}

func (a *app) dispatchMorningSchedulePushes(ctx context.Context, now time.Time) (int64, error) {
	targetDate := now.Format("2006-01-02")
	rows, err := a.db.Query(ctx, `
		select distinct fm.user_id, s.title, coalesce(to_char(s.schedule_time, 'HH24:MI'), '')
		from family_schedules s
		join family_members fm on fm.family_id = s.family_id and fm.can_read = true
		left join notification_preferences preference on preference.user_id = fm.user_id
		where s.deleted_at is null
		  and coalesce(preference.morning_schedule_push_enabled, true) = true
		  and (
				s.schedule_date = $1::date
				or (coalesce(s.repeat_rule, 'none') = 'weekly' and s.schedule_date <= $1::date and mod(($1::date - s.schedule_date), 7) = 0)
				or (coalesce(s.repeat_rule, 'none') = 'monthly' and s.schedule_date <= $1::date and extract(day from s.schedule_date) = extract(day from $1::date))
				or (coalesce(s.repeat_rule, 'none') = 'yearly' and s.schedule_date <= $1::date and extract(month from s.schedule_date) = extract(month from $1::date) and extract(day from s.schedule_date) = extract(day from $1::date))
			  )
		  and not exists (
				select 1 from family_schedule_exceptions e where e.schedule_id = s.id and e.occurrence_date = $1::date
			  )
	`, targetDate)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	type summary struct {
		count int
		first string
	}
	summaries := map[int64]summary{}
	for rows.Next() {
		var userID int64
		var title, scheduleTime string
		if err := rows.Scan(&userID, &title, &scheduleTime); err != nil {
			return 0, err
		}
		item := summaries[userID]
		item.count++
		if item.first == "" {
			if scheduleTime != "" {
				item.first = scheduleTime + " · " + title
			} else {
				item.first = title
			}
		}
		summaries[userID] = item
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	var sent int64
	for userID, item := range summaries {
		tag, err := a.db.Exec(ctx, `
			insert into schedule_push_deliveries (user_id, schedule_id, delivery_type, target_date)
			values ($1, 0, 'SCHEDULE_MORNING', $2)
			on conflict (user_id, schedule_id, delivery_type, target_date) do nothing
		`, userID, targetDate)
		if err != nil {
			return sent, err
		}
		if tag.RowsAffected() == 0 {
			continue
		}
		body := item.first
		if item.count > 1 {
			body += fmt.Sprintf(" 외 %d건", item.count-1)
		}
		a.sendPushToUser(ctx, userID, "오늘 일정 "+strconv.Itoa(item.count)+"건", body)
		sent++
	}
	return sent, nil
}

func (a *app) markNotificationRead(w http.ResponseWriter, r *http.Request, user authUser) {
	id, ok := pathID(w, r, "notificationId")
	if !ok {
		return
	}
	row := a.db.QueryRow(r.Context(), `
		update app_notifications set read_at = now() where id = $1 and user_id = $2
		returning id, user_id, family_id, schedule_id, community_post_id, community_comment_id, type, title, body, target_date, read_at, created_at
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

type activityStatusWriter struct {
	http.ResponseWriter
	statusCode int
}

func (w *activityStatusWriter) WriteHeader(statusCode int) {
	w.statusCode = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *activityStatusWriter) Write(body []byte) (int, error) {
	if w.statusCode == 0 {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}

func (a *app) requireAuth(next func(http.ResponseWriter, *http.Request, authUser)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		isFamilyRequest := strings.HasPrefix(r.URL.Path, "/api/families") || strings.HasPrefix(r.URL.Path, "/api/family-invitations")
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			if isFamilyRequest {
				a.log.Warn("family api authentication missing", "method", r.Method, "path", r.URL.Path)
			}
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		user, ok := a.verifyToken(strings.TrimPrefix(header, "Bearer "))
		if !ok || !a.isActiveSession(r.Context(), user) {
			if isFamilyRequest {
				a.log.Warn("family api session rejected", "method", r.Method, "path", r.URL.Path, "userId", user.ID)
			}
			writeError(w, http.StatusUnauthorized, "invalid session")
			return
		}
		trackedWriter := &activityStatusWriter{ResponseWriter: w}
		next(trackedWriter, r, user)
		statusCode := trackedWriter.statusCode
		if statusCode == 0 {
			statusCode = http.StatusOK
		}
		if isFamilyRequest {
			a.log.Info("family api request completed", "method", r.Method, "path", r.URL.Path, "familyId", r.PathValue("familyId"), "userId", user.ID, "status", statusCode)
		}
		menuKey := strings.TrimSpace(r.Header.Get("X-Family-Platform-Data-View"))
		if !user.PlatformAdmin && statusCode >= http.StatusOK && statusCode < http.StatusBadRequest && analyticsMenuKeySet[menuKey] && shouldRecordDataViewActivity(r) {
			route := activityRoute(r)
			a.recordActivityEvent(r.Context(), user.ID, "menu_view", menuKey, route, r.Method, statusCode)
		}
	}
}

func (a *app) isActiveSession(ctx context.Context, user authUser) bool {
	var activeSessionID sql.NullString
	var activeSessionExpiresAt sql.NullTime
	var moderationSuspendedAt sql.NullTime
	err := a.db.QueryRow(ctx, "select active_session_id, active_session_expires_at, moderation_suspended_at from app_users where id = $1 and deleted_at is null", user.ID).Scan(&activeSessionID, &activeSessionExpiresAt, &moderationSuspendedAt)
	if err != nil || !activeSessionID.Valid || activeSessionID.String != user.SessionID {
		return false
	}
	if moderationSuspendedAt.Valid {
		return false
	}
	if !activeSessionExpiresAt.Valid || !activeSessionExpiresAt.Time.After(time.Now()) {
		_, _ = a.db.Exec(ctx, "update app_users set active_session_id = null, active_session_expires_at = null where id = $1 and active_session_id = $2", user.ID, user.SessionID)
		return false
	}
	return true
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
	nickname := oauthDisplayNickname(provider, profile.Nickname, email)

	tx, err := a.db.Begin(ctx)
	if err != nil {
		return authResponse{}, err
	}
	defer tx.Rollback(ctx)

	var userID int64
	var currentEmail, currentNickname string
	var platformAdmin bool
	var activeSessionID sql.NullString
	var activeSessionExpiresAt sql.NullTime
	err = tx.QueryRow(ctx, `
		select u.id, u.email, u.nickname, u.platform_admin, u.active_session_id, u.active_session_expires_at
		from oauth_identities oi
		join app_users u on u.id = oi.user_id
		where oi.provider = $1 and oi.provider_user_id = $2 and u.deleted_at is null
	`, provider, profile.ProviderUserID).Scan(&userID, &currentEmail, &currentNickname, &platformAdmin, &activeSessionID, &activeSessionExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `
			select id, email, nickname, platform_admin, active_session_id, active_session_expires_at
			from app_users
			where provider = $1 and provider_user_id = $2 and deleted_at is null
		`, provider, profile.ProviderUserID).Scan(&userID, &currentEmail, &currentNickname, &platformAdmin, &activeSessionID, &activeSessionExpiresAt)
		if err == nil {
			if err := a.linkOAuthIdentity(ctx, tx, provider, profile, userID); err != nil {
				return authResponse{}, err
			}
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		if email == "" {
			return authResponse{}, errOAuthEmailRequired
		}
		created, err := a.findOrCreateOAuthUser(ctx, tx, provider, profile.ProviderUserID, email, nickname, &userID, &currentEmail, &currentNickname, &platformAdmin, &activeSessionID, &activeSessionExpiresAt)
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
		if err := a.reconcileOAuthEmail(ctx, tx, provider, profile.ProviderUserID, email, nickname, &userID, &currentEmail, &currentNickname, &platformAdmin, &activeSessionID, &activeSessionExpiresAt); err != nil {
			return authResponse{}, err
		}
	}
	if err := a.linkOAuthIdentity(ctx, tx, provider, profile, userID); err != nil {
		return authResponse{}, err
	}
	var moderationSuspendedAt sql.NullTime
	if err := tx.QueryRow(ctx, "select moderation_suspended_at from app_users where id = $1", userID).Scan(&moderationSuspendedAt); err != nil {
		return authResponse{}, err
	}
	if moderationSuspendedAt.Valid {
		return authResponse{}, errAccountSuspended
	}

	if activeSessionID.Valid && activeSessionID.String != "" && activeSessionExpiresAt.Valid && activeSessionExpiresAt.Time.After(time.Now()) && !forceLogin {
		return authResponse{}, errActiveSessionExists
	}
	sessionID := newSessionID()
	sessionExpiresAt := a.sessionExpiresAt(false)
	_, err = tx.Exec(ctx, `
		update app_users
		set active_session_id = $1,
		    active_session_expires_at = $5,
		    failed_login_attempts = 0,
		    locked_until = null,
		    provider = $3,
		    provider_user_id = $4
		where id = $2
	`, sessionID, userID, provider, profile.ProviderUserID, sessionExpiresAt)
	if err != nil {
		return authResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return authResponse{}, err
	}

	user := authUser{ID: userID, Email: currentEmail, PlatformAdmin: platformAdmin, SessionID: sessionID}
	return authResponse{
		AccessToken:   a.issueToken(user, sessionExpiresAt),
		UserID:        userID,
		Email:         currentEmail,
		LoginEmail:    firstNonEmpty(profile.Email, currentEmail),
		Nickname:      currentNickname,
		PlatformAdmin: platformAdmin,
		Provider:      provider,
	}, nil
}

func (a *app) findOrCreateOAuthUser(ctx context.Context, tx pgx.Tx, provider, providerUserID, email, nickname string, userID *int64, currentEmail *string, currentNickname *string, platformAdmin *bool, activeSessionID *sql.NullString, activeSessionExpiresAt *sql.NullTime) (bool, error) {
	if email != "" {
		err := tx.QueryRow(ctx, `
			update app_users
			set provider = $1,
			    provider_user_id = $2,
			    email_verified_at = coalesce(email_verified_at, now()),
			    email_verification_required = false
			where email = $3 and deleted_at is null
			returning id, email, nickname, platform_admin, active_session_id, active_session_expires_at
		`, provider, providerUserID, email).Scan(userID, currentEmail, currentNickname, platformAdmin, activeSessionID, activeSessionExpiresAt)
		if err == nil {
			if err := a.linkOAuthIdentity(ctx, tx, provider, oauthProfile{ProviderUserID: providerUserID, Email: email, Nickname: nickname}, *userID); err != nil {
				return false, err
			}
			return false, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return false, err
		}
	}

	var userCount int64
	if err := tx.QueryRow(ctx, "select count(*) from app_users where deleted_at is null").Scan(&userCount); err != nil {
		return false, err
	}
	err := tx.QueryRow(ctx, `
		insert into app_users (created_at, email, nickname, platform_admin, provider, provider_user_id, active_session_id, active_session_expires_at, failed_login_attempts, email_verified_at, email_verification_required)
		values (now(), $1, $2, $3, $4, $5, '', null, 0, now(), false)
		returning id, email, nickname, platform_admin, active_session_id, active_session_expires_at
	`, email, nickname, userCount == 0, provider, providerUserID).Scan(userID, currentEmail, currentNickname, platformAdmin, activeSessionID, activeSessionExpiresAt)
	if err != nil {
		return false, err
	}
	if err := a.linkOAuthIdentity(ctx, tx, provider, oauthProfile{ProviderUserID: providerUserID, Email: email, Nickname: nickname}, *userID); err != nil {
		return false, err
	}
	return true, nil
}

func oauthDisplayNickname(provider, nickname, email string) string {
	nickname = strings.TrimSpace(nickname)
	if strings.Contains(nickname, "@") {
		nickname = strings.TrimSpace(strings.Split(nickname, "@")[0])
	}
	if nickname == "" && email != "" {
		nickname = strings.TrimSpace(strings.Split(email, "@")[0])
	}
	if nickname == "" {
		nickname = provider + " user"
	}
	return nickname
}

func (a *app) reconcileOAuthEmail(ctx context.Context, tx pgx.Tx, provider, providerUserID, email, nickname string, userID *int64, currentEmail *string, currentNickname *string, platformAdmin *bool, activeSessionID *sql.NullString, activeSessionExpiresAt *sql.NullTime) error {
	err := tx.QueryRow(ctx, `
		update app_users
		set provider = $1,
		    provider_user_id = $2,
		    email_verified_at = coalesce(email_verified_at, now()),
		    email_verification_required = false
		where email = $3 and deleted_at is null
		returning id, email, nickname, platform_admin, active_session_id, active_session_expires_at
	`, provider, providerUserID, email).Scan(userID, currentEmail, currentNickname, platformAdmin, activeSessionID, activeSessionExpiresAt)
	if err == nil {
		return a.linkOAuthIdentity(ctx, tx, provider, oauthProfile{ProviderUserID: providerUserID, Email: email, Nickname: nickname}, *userID)
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
		    provider = $4,
		    provider_user_id = $5,
		    email_verified_at = coalesce(email_verified_at, now()),
		    email_verification_required = false
		where id = $3
		returning id, email, nickname, platform_admin, active_session_id, active_session_expires_at
	`, email, nickname, *userID, provider, providerUserID).Scan(userID, currentEmail, currentNickname, platformAdmin, activeSessionID, activeSessionExpiresAt)
}

func (a *app) linkOAuthIdentity(ctx context.Context, tx pgx.Tx, provider string, profile oauthProfile, userID int64) error {
	_, err := tx.Exec(ctx, `
		insert into oauth_identities (provider, provider_user_id, user_id, email, nickname, created_at, updated_at)
		values ($1, $2, $3, nullif($4, ''), nullif($5, ''), now(), now())
		on conflict (provider, provider_user_id) do update
		set user_id = excluded.user_id,
		    email = coalesce(excluded.email, oauth_identities.email),
		    nickname = coalesce(excluded.nickname, oauth_identities.nickname),
		    updated_at = now()
	`, provider, profile.ProviderUserID, userID, profile.Email, profile.Nickname)
	return err
}

func (a *app) issueToken(user authUser, expiresAt time.Time) string {
	payload := fmt.Sprintf("%d\n%s\n%t\n%d\n%s", user.ID, user.Email, user.PlatformAdmin, expiresAt.Unix(), user.SessionID)
	encodedPayload := base64.RawURLEncoding.EncodeToString([]byte(payload))
	return encodedPayload + "." + a.sign(encodedPayload)
}

func (a *app) sessionExpiresAt(autoLogin bool) time.Time {
	validitySeconds := a.cfg.tokenValiditySeconds
	if autoLogin {
		validitySeconds = a.cfg.autoLoginValiditySeconds
	}
	return time.Now().Add(time.Duration(validitySeconds) * time.Second)
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
		ExpiresAt:     time.Unix(expiresAt, 0),
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
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Family-Platform-Data-View")
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
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
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
	media_storage_unlimited boolean not null default false,
	media_file_size_unlimited boolean not null default false,
  provider varchar(255),
  provider_user_id varchar(255),
  password_hash varchar(255),
  active_session_id varchar(255),
  active_session_expires_at timestamp with time zone,
  locked_until timestamp with time zone,
  moderation_suspended_at timestamp with time zone,
  moderation_reason varchar(500),
  failed_login_attempts integer default 0,
  email_verified_at timestamp with time zone,
  email_verification_required boolean not null default false,
	 email_verification_resend_count integer not null default 0,
  deleted_at timestamp with time zone
);
alter table if exists app_users add column if not exists provider varchar(255);
alter table if exists app_users add column if not exists media_storage_unlimited boolean not null default false;
alter table if exists app_users add column if not exists media_file_size_unlimited boolean not null default false;
alter table if exists app_users add column if not exists provider_user_id varchar(255);
alter table if exists app_users add column if not exists login_id varchar(64);
alter table if exists app_users add column if not exists active_session_expires_at timestamp with time zone;
alter table if exists app_users add column if not exists email_verified_at timestamp with time zone;
alter table if exists app_users add column if not exists email_verification_required boolean not null default false;
alter table if exists app_users add column if not exists email_verification_resend_count integer not null default 0;
alter table if exists app_users add column if not exists deleted_at timestamp with time zone;
alter table if exists app_users add column if not exists moderation_suspended_at timestamp with time zone;
alter table if exists app_users add column if not exists moderation_reason varchar(500);
create unique index if not exists idx_app_users_email_lower on app_users (lower(email)) where email is not null;
create unique index if not exists idx_app_users_login_id_lower on app_users (lower(login_id)) where login_id is not null;
create unique index if not exists idx_app_users_provider_subject on app_users (provider, provider_user_id) where provider is not null and provider_user_id is not null;
create index if not exists idx_app_users_deleted_at on app_users (deleted_at) where deleted_at is not null;
create index if not exists idx_app_users_moderation_suspended on app_users (moderation_suspended_at) where moderation_suspended_at is not null;
create table if not exists community_hotdeal_settings (
  id smallint primary key check (id = 1),
  published boolean not null default false,
  updated_by_user_id bigint references app_users(id) on delete set null,
  updated_at timestamp with time zone not null default now()
);
insert into community_hotdeal_settings (id, published)
values (1, false)
on conflict (id) do nothing;
create table if not exists community_hotdeal_items (
  original_url text primary key,
  source varchar(64) not null,
  source_label varchar(100) not null,
  title varchar(500) not null,
  summary varchar(1000) not null default '',
  price varchar(100) not null default '',
  collected_at timestamp with time zone not null default now(),
  published_at timestamp with time zone,
  view_count bigint not null default 0,
  comment_count bigint not null default 0
);
alter table if exists community_hotdeal_items add column if not exists published_at timestamp with time zone;
alter table if exists community_hotdeal_items add column if not exists view_count bigint not null default 0;
alter table if exists community_hotdeal_items add column if not exists comment_count bigint not null default 0;
create index if not exists idx_community_hotdeal_items_source_collected on community_hotdeal_items (source, collected_at desc);
create table if not exists media_files (
  storage_key varchar(255) primary key,
  uploaded_by_user_id bigint not null references app_users(id) on delete cascade,
  byte_size bigint not null check (byte_size >= 0),
  content_type varchar(255),
  created_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone
);
create index if not exists idx_media_files_user_active on media_files (uploaded_by_user_id) where deleted_at is null;
create table if not exists user_moderation_warnings (
  id bigint generated by default as identity primary key,
  user_id bigint not null references app_users(id) on delete cascade,
  issued_by_user_id bigint references app_users(id) on delete set null,
  reason varchar(500) not null,
  source_type varchar(64) not null default 'MANUAL',
  source_id bigint,
  cancelled_at timestamp with time zone,
  cancelled_by_user_id bigint references app_users(id) on delete set null,
  created_at timestamp with time zone not null default now()
);
alter table if exists user_moderation_warnings add column if not exists cancelled_at timestamp with time zone;
alter table if exists user_moderation_warnings add column if not exists cancelled_by_user_id bigint references app_users(id) on delete set null;
create index if not exists idx_user_moderation_warnings_user_created on user_moderation_warnings (user_id, created_at desc);
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
  email varchar(255),
  nickname varchar(255),
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone,
  primary key (provider, provider_user_id)
);
alter table if exists oauth_identities add column if not exists email varchar(255);
alter table if exists oauth_identities add column if not exists nickname varchar(255);
alter table if exists oauth_identities add column if not exists updated_at timestamp with time zone;
create index if not exists idx_oauth_identities_user on oauth_identities (user_id);
create index if not exists idx_oauth_identities_email_lower on oauth_identities (lower(email)) where email is not null;
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
alter table account_recovery_inquiries add column if not exists updated_at timestamp with time zone;
alter table account_recovery_inquiries add column if not exists replied_at timestamp with time zone;
alter table account_recovery_inquiries add column if not exists reply_message text;
alter table account_recovery_inquiries add column if not exists replied_by_user_id bigint references app_users(id) on delete set null;
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
create table if not exists holidays (
  date_key date primary key,
  name varchar(255) not null,
  source varchar(64) not null default 'manual',
  is_holiday boolean not null default true,
  synced_at timestamp with time zone,
  updated_at timestamp with time zone not null default now()
);
alter table if exists holidays add column if not exists source varchar(64) not null default 'manual';
alter table if exists holidays add column if not exists is_holiday boolean not null default true;
alter table if exists holidays add column if not exists synced_at timestamp with time zone;
alter table if exists holidays add column if not exists updated_at timestamp with time zone not null default now();
create index if not exists idx_holidays_date_key on holidays (date_key);
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
  shared_menu_keys text[] not null default array['calendar','ledger','travel','baby','diary','restaurant','community']::text[],
  user_id bigint
);
alter table if exists family_members add column if not exists shared_menu_keys text[] not null default array['calendar','ledger','travel','baby','diary','restaurant','community']::text[];
-- Rows inserted before a menu key existed keep whatever shorter array was
-- the default at insert time (the column default only applies on insert),
-- so members added before e.g. 'travel'/'restaurant'/'community' shipped
-- never got it in their shared_menu_keys and sharing silently stayed off
-- for that menu. Backfill any key from the current default that's missing.
update family_members set shared_menu_keys = array_append(shared_menu_keys, 'calendar') where not ('calendar' = any(shared_menu_keys));
update family_members set shared_menu_keys = array_append(shared_menu_keys, 'ledger') where not ('ledger' = any(shared_menu_keys));
update family_members set shared_menu_keys = array_append(shared_menu_keys, 'travel') where not ('travel' = any(shared_menu_keys));
update family_members set shared_menu_keys = array_append(shared_menu_keys, 'baby') where not ('baby' = any(shared_menu_keys));
update family_members set shared_menu_keys = array_append(shared_menu_keys, 'diary') where not ('diary' = any(shared_menu_keys));
update family_members set shared_menu_keys = array_append(shared_menu_keys, 'restaurant') where not ('restaurant' = any(shared_menu_keys));
update family_members set shared_menu_keys = array_append(shared_menu_keys, 'community') where not ('community' = any(shared_menu_keys));
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
  shared_menu_keys text[] not null default array['calendar','ledger','travel','baby','diary','restaurant','community']::text[],
  status varchar(64) not null default 'PENDING',
  created_at timestamp with time zone not null,
  responded_at timestamp with time zone
);
alter table if exists family_invitations add column if not exists shared_menu_keys text[] not null default array['calendar','ledger','travel','baby','diary','restaurant','community']::text[];
update family_invitations set shared_menu_keys = array_append(shared_menu_keys, 'travel') where status = 'PENDING' and not ('travel' = any(shared_menu_keys));
update family_invitations set shared_menu_keys = array_append(shared_menu_keys, 'restaurant') where status = 'PENDING' and not ('restaurant' = any(shared_menu_keys));
update family_invitations set shared_menu_keys = array_append(shared_menu_keys, 'community') where status = 'PENDING' and not ('community' = any(shared_menu_keys));
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
alter table if exists family_schedules add column if not exists created_by_user_id bigint;
alter table if exists family_schedules alter column family_id set default 0;
update family_schedules set family_id = 0 where family_id is null;
create table if not exists family_schedule_exceptions (
  id bigint generated by default as identity primary key,
  schedule_id bigint not null references family_schedules(id) on delete cascade,
  occurrence_date date not null,
  created_at timestamp with time zone default now(),
  unique (schedule_id, occurrence_date)
);
create index if not exists idx_family_schedule_exceptions_schedule on family_schedule_exceptions (schedule_id, occurrence_date);
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
  installment_group_key varchar(255),
  installment_sequence integer,
  installment_months integer,
  title varchar(255),
  transaction_date date
);
alter table if exists ledger_entries add column if not exists updated_at timestamp with time zone;
alter table if exists ledger_entries add column if not exists deleted_at timestamp with time zone;
alter table if exists ledger_entries add column if not exists created_by_user_id bigint;
alter table if exists ledger_entries add column if not exists installment_group_key varchar(255);
alter table if exists ledger_entries add column if not exists installment_sequence integer;
alter table if exists ledger_entries add column if not exists installment_months integer;
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
alter table if exists trips add column if not exists created_by_user_id bigint;
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
alter table if exists travel_records add column if not exists created_by_user_id bigint;
create table if not exists travel_record_media_urls (
  travel_record_id bigint not null,
  media_urls varchar(2048)
);
create table if not exists restaurants (
  id bigint generated by default as identity primary key,
  family_id bigint,
  name varchar(255),
  menu varchar(255),
  price numeric(38,2),
  rating numeric(4,2),
  visit_date date,
  location varchar(255),
  address varchar(255),
  latitude double precision,
  longitude double precision,
  memo text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_by_user_id bigint
);
alter table if exists restaurants add column if not exists updated_at timestamp with time zone;
alter table if exists restaurants add column if not exists deleted_at timestamp with time zone;
alter table if exists restaurants add column if not exists created_by_user_id bigint;
alter table if exists restaurants add column if not exists address varchar(255);
alter table if exists restaurants drop column if exists scope;
create table if not exists restaurant_media_urls (
  restaurant_id bigint not null,
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
delete from common_codes where group_id in (
  select id from common_code_groups where menu_key = 'restaurant' and code = 'scope'
);
delete from common_code_groups where menu_key = 'restaurant' and code = 'scope';
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
create index if not exists idx_data_change_histories_created on data_change_histories (created_at desc);
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
	initial_height_cm numeric(38,2),
	initial_weight_kg numeric(38,2),
  memo varchar(255),
  name varchar(255),
  photo_url varchar(2048)
);
alter table if exists baby_profiles add column if not exists updated_at timestamp with time zone;
alter table if exists baby_profiles add column if not exists deleted_at timestamp with time zone;
alter table if exists baby_profiles add column if not exists created_by_user_id bigint;
alter table if exists baby_profiles add column if not exists initial_height_cm numeric(38,2);
alter table if exists baby_profiles add column if not exists initial_weight_kg numeric(38,2);
update baby_profiles b
set initial_height_cm = coalesce(
      b.initial_height_cm,
      (select nullif(h.snapshot->>'latestHeightCm', '')::numeric from data_change_histories h where h.entity_type = 'baby_profile' and h.entity_id = b.id and h.action = 'create' order by h.created_at asc limit 1),
      b.latest_height_cm
    ),
    initial_weight_kg = coalesce(
      b.initial_weight_kg,
      (select nullif(h.snapshot->>'latestWeightKg', '')::numeric from data_change_histories h where h.entity_type = 'baby_profile' and h.entity_id = b.id and h.action = 'create' order by h.created_at asc limit 1),
      b.latest_weight_kg
    );
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
  sleep_end_time varchar(255),
  record_type varchar(255),
  weight_kg numeric(38,2)
);
alter table if exists baby_records add column if not exists updated_at timestamp with time zone;
alter table if exists baby_records add column if not exists deleted_at timestamp with time zone;
alter table if exists baby_records add column if not exists created_by_user_id bigint;
alter table if exists baby_records add column if not exists sleep_end_time varchar(255);
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
	  diary_time time,
  family_id bigint,
  max_temperature integer,
  min_temperature integer,
  mood varchar(255),
  title varchar(255),
  weather varchar(255)
);
alter table if exists family_diaries add column if not exists updated_at timestamp with time zone;
alter table if exists family_diaries add column if not exists deleted_at timestamp with time zone;
alter table if exists family_diaries add column if not exists created_by_user_id bigint;
alter table if exists family_diaries add column if not exists diary_time time;
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
  view_count bigint not null default 0,
  is_private boolean not null default false,
  comments_enabled boolean not null default true
);
alter table community_posts add column if not exists view_count bigint not null default 0;
alter table if exists community_posts add column if not exists deleted_at timestamp with time zone;
alter table if exists community_posts add column if not exists is_private boolean not null default false;
alter table if exists community_posts add column if not exists comments_enabled boolean not null default true;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'community_posts_text_length_check') then
    alter table community_posts add constraint community_posts_text_length_check check (char_length(title) <= 255 and char_length(body) <= 5000) not valid;
  end if;
end $$;
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
create table if not exists community_post_user_views (
  community_post_id bigint not null,
  user_id bigint not null,
  viewed_at timestamp with time zone not null default now(),
  primary key (community_post_id, user_id)
);
create table if not exists community_post_reactions (
  community_post_id bigint not null references community_posts(id) on delete cascade,
  user_id bigint not null references app_users(id) on delete cascade,
  reaction varchar(16) not null check (reaction in ('like', 'dislike')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (community_post_id, user_id)
);
create index if not exists idx_community_post_reactions_post_reaction on community_post_reactions (community_post_id, reaction);
create table if not exists community_comments (
  id bigint generated by default as identity primary key,
  author_id bigint,
  author_name varchar(255),
  body text,
  created_at timestamp with time zone,
  post_id bigint,
  parent_comment_id bigint,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
);
alter table if exists community_comments add column if not exists deleted_at timestamp with time zone;
alter table if exists community_comments add column if not exists parent_comment_id bigint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'community_comments_text_length_check') then
    alter table community_comments add constraint community_comments_text_length_check check (char_length(body) <= 1000) not valid;
  end if;
end $$;
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
create index if not exists idx_data_change_histories_created on data_change_histories (created_at desc);
create table if not exists admin_data_access_logs (
  id bigint generated by default as identity primary key,
  admin_user_id bigint not null references app_users(id) on delete restrict,
  target_user_id bigint not null references app_users(id) on delete restrict,
  purpose varchar(128) not null,
  accessed_at timestamp with time zone not null default now()
);
create index if not exists idx_admin_data_access_logs_target_accessed on admin_data_access_logs (target_user_id, accessed_at desc);
create index if not exists idx_admin_data_access_logs_admin_accessed on admin_data_access_logs (admin_user_id, accessed_at desc);
create table if not exists app_activity_events (
  id bigint generated by default as identity primary key,
  user_id bigint references app_users(id) on delete set null,
  event_type varchar(32) not null,
  menu_key varchar(64) not null default '',
  route varchar(255) not null default '',
  http_method varchar(16) not null default '',
  status_code integer not null default 200,
  occurred_at timestamp with time zone not null
);
create index if not exists idx_app_activity_events_occurred on app_activity_events (occurred_at desc);
create index if not exists idx_app_activity_events_menu_occurred on app_activity_events (menu_key, occurred_at desc);
create index if not exists idx_app_activity_events_user_occurred on app_activity_events (user_id, occurred_at desc);
create table if not exists app_activity_daily_aggregates (
  aggregate_date date not null,
  aggregate_hour smallint not null,
  metric_type varchar(32) not null,
  menu_key varchar(64) not null default '',
  entity_type varchar(64) not null default '',
  action varchar(64) not null default '',
  event_count integer not null default 0,
  unique_user_count integer not null default 0,
  primary key (aggregate_date, aggregate_hour, metric_type, menu_key, entity_type, action)
);
create index if not exists idx_app_activity_daily_aggregates_date on app_activity_daily_aggregates (aggregate_date desc);
create table if not exists batch_run_histories (
  id bigint generated by default as identity primary key,
  batch_key varchar(64) not null,
  trigger_type varchar(32) not null,
  requested_by_user_id bigint references app_users(id) on delete set null,
  started_at timestamp with time zone not null,
  completed_at timestamp with time zone,
  status varchar(32) not null,
  processed_count bigint not null default 0,
  message varchar(1024) not null default ''
);
create index if not exists idx_batch_run_histories_key_started on batch_run_histories (batch_key, started_at desc);
update ledger_entries t set created_by_user_id = h.actor_user_id
from (select distinct on (entity_id) entity_id, actor_user_id from data_change_histories where entity_type = 'ledger_entry' and action = 'create' and actor_user_id is not null order by entity_id, created_at asc) h
where t.id = h.entity_id and t.created_by_user_id is null;
update family_schedules t set created_by_user_id = h.actor_user_id
from (select distinct on (entity_id) entity_id, actor_user_id from data_change_histories where entity_type = 'family_schedule' and action = 'create' and actor_user_id is not null order by entity_id, created_at asc) h
where t.id = h.entity_id and t.created_by_user_id is null;
update trips t set created_by_user_id = h.actor_user_id
from (select distinct on (entity_id) entity_id, actor_user_id from data_change_histories where entity_type = 'trip' and action = 'create' and actor_user_id is not null order by entity_id, created_at asc) h
where t.id = h.entity_id and t.created_by_user_id is null;
update travel_records t set created_by_user_id = h.actor_user_id
from (select distinct on (entity_id) entity_id, actor_user_id from data_change_histories where entity_type = 'travel_record' and action = 'create' and actor_user_id is not null order by entity_id, created_at asc) h
where t.id = h.entity_id and t.created_by_user_id is null;
update baby_profiles t set created_by_user_id = h.actor_user_id
from (select distinct on (entity_id) entity_id, actor_user_id from data_change_histories where entity_type = 'baby_profile' and action = 'create' and actor_user_id is not null order by entity_id, created_at asc) h
where t.id = h.entity_id and t.created_by_user_id is null;
update baby_records t set created_by_user_id = h.actor_user_id
from (select distinct on (entity_id) entity_id, actor_user_id from data_change_histories where entity_type = 'baby_record' and action = 'create' and actor_user_id is not null order by entity_id, created_at asc) h
where t.id = h.entity_id and t.created_by_user_id is null;
update family_diaries t set created_by_user_id = h.actor_user_id
from (select distinct on (entity_id) entity_id, actor_user_id from data_change_histories where entity_type = 'family_diary' and action = 'create' and actor_user_id is not null order by entity_id, created_at asc) h
where t.id = h.entity_id and t.created_by_user_id is null;
create table if not exists app_notifications (
  id bigint generated by default as identity primary key,
  body varchar(255),
  created_at timestamp with time zone,
  family_id bigint,
  read_at timestamp with time zone,
  schedule_id bigint,
  community_post_id bigint,
  community_comment_id bigint,
  target_date date,
  title varchar(255),
  type varchar(255),
  user_id bigint,
  constraint uk_app_notifications_schedule_user unique (user_id, schedule_id, type, target_date)
);
alter table if exists app_notifications add column if not exists community_post_id bigint;
alter table if exists app_notifications add column if not exists community_comment_id bigint;
alter table if exists family_schedules add column if not exists push_enabled boolean not null default true;
create table if not exists push_devices (
  id bigint generated by default as identity primary key,
  user_id bigint not null references app_users(id) on delete cascade,
  device_id varchar(128) not null,
  token text not null,
  platform varchar(32) not null default 'android',
  active boolean not null default true,
  updated_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  unique (user_id, device_id),
  unique (token)
);
create index if not exists idx_push_devices_user_active on push_devices (user_id, active);
create table if not exists notification_preferences (
  user_id bigint primary key references app_users(id) on delete cascade,
  morning_schedule_push_enabled boolean not null default true,
  updated_at timestamp with time zone not null default now()
);
create table if not exists schedule_push_deliveries (
  id bigint generated by default as identity primary key,
  user_id bigint not null references app_users(id) on delete cascade,
  schedule_id bigint not null default 0,
  delivery_type varchar(32) not null,
  target_date date not null,
  created_at timestamp with time zone not null default now(),
  unique (user_id, schedule_id, delivery_type, target_date)
);
create index if not exists idx_schedule_push_deliveries_date on schedule_push_deliveries (target_date, delivery_type);
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
create index if not exists idx_community_post_user_views_user on community_post_user_views (user_id, viewed_at);
create index if not exists idx_community_comments_post_created on community_comments (post_id, created_at);
create index if not exists idx_community_comments_parent on community_comments (parent_comment_id, created_at);
create index if not exists idx_app_notifications_user_created on app_notifications (user_id, created_at);
`)
	return err
}

func readJSON(w http.ResponseWriter, r *http.Request, out any) bool {
	defer r.Body.Close()
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(out); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "request body too large")
			return false
		}
		writeError(w, http.StatusBadRequest, "invalid json body")
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
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

func (a *app) isPlatformAdminHistoryActor(ctx context.Context, userID *int64, identity string) bool {
	if userID != nil {
		var platformAdmin bool
		if err := a.db.QueryRow(ctx, "select platform_admin from app_users where id = $1", *userID).Scan(&platformAdmin); err == nil {
			return platformAdmin
		}
	}
	identity = normalizeEmail(identity)
	if identity == "" {
		return false
	}
	var platformAdmin bool
	err := a.db.QueryRow(ctx, `
		select exists(
			select 1
			from app_users
			where platform_admin = true
				and (lower(coalesce(email, '')) = $1 or lower(coalesce(login_id, '')) = $1)
		)
	`, identity).Scan(&platformAdmin)
	return err == nil && platformAdmin
}

func (a *app) recordLoginHistory(ctx context.Context, userID *int64, email, provider, eventType, result, reason string) {
	if a.isPlatformAdminHistoryActor(ctx, userID, email) {
		return
	}
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
	if a.isPlatformAdminHistoryActor(ctx, &userID, "") {
		return
	}
	var snapshotJSON []byte
	if snapshot != nil {
		snapshotJSON, _ = json.Marshal(snapshot)
	}
	_, _ = a.db.Exec(ctx, `
		insert into data_change_histories (entity_type, entity_id, family_id, actor_user_id, action, created_at, snapshot)
		values ($1, $2, $3, $4, $5, now(), $6)
	`, entityType, entityID, familyID, userID, action, snapshotJSON)
}

type adminUserSearchItem struct {
	ID        int64  `json:"id"`
	LoginID   string `json:"loginId"`
	Nickname  string `json:"nickname"`
	Provider  string `json:"provider"`
	CreatedAt string `json:"createdAt"`
}

type adminUserDataRecord struct {
	MenuKey    string          `json:"menuKey"`
	EntityType string          `json:"entityType"`
	EntityID   int64           `json:"entityId"`
	Action     string          `json:"action"`
	CreatedAt  string          `json:"createdAt"`
	Snapshot   json.RawMessage `json:"snapshot,omitempty"`
}

type adminUserDataResponse struct {
	User  adminUserSearchItem   `json:"user"`
	Items []adminUserDataRecord `json:"items"`
	Total int64                 `json:"total"`
}

func validAdminUserSearchQuery(value string) bool {
	return strings.TrimSpace(value) != ""
}

func (a *app) searchAdminUsers(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("query"))
	if !validAdminUserSearchQuery(query) {
		writeError(w, http.StatusBadRequest, "enter a nickname or login ID")
		return
	}
	matcher := "%" + query + "%"
	rows, err := a.db.Query(r.Context(), `
		select id, coalesce(login_id, ''), coalesce(nickname, ''), coalesce(provider, ''), created_at
		from app_users
		where deleted_at is null
		  and (cast(id as text) = $1 or coalesce(login_id, '') ilike $2 or coalesce(nickname, '') ilike $2)
		order by case when cast(id as text) = $1 then 0 else 1 end, created_at desc
		limit 20
	`, query, matcher)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user search failed")
		return
	}
	defer rows.Close()
	items := []adminUserSearchItem{}
	for rows.Next() {
		var item adminUserSearchItem
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.LoginID, &item.Nickname, &item.Provider, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "user search scan failed")
			return
		}
		item.CreatedAt = formatTime(createdAt)
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *app) adminUserData(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	targetUserID, ok := pathID(w, r, "userId")
	if !ok {
		return
	}
	var response adminUserDataResponse
	var createdAt time.Time
	err := a.db.QueryRow(r.Context(), `
		select id, coalesce(login_id, ''), coalesce(nickname, ''), coalesce(provider, ''), created_at
		from app_users where id = $1 and deleted_at is null
	`, targetUserID).Scan(&response.User.ID, &response.User.LoginID, &response.User.Nickname, &response.User.Provider, &createdAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user data read failed")
		return
	}
	response.User.CreatedAt = formatTime(createdAt)
	if err := a.db.QueryRow(r.Context(), `
		select count(*) from data_change_histories
		where actor_user_id = $1 and entity_type <> 'admin_user_data_view'
	`, targetUserID).Scan(&response.Total); err != nil {
		writeError(w, http.StatusInternalServerError, "user data count failed")
		return
	}
	rows, err := a.db.Query(r.Context(), `
		select entity_type, entity_id, action, created_at, snapshot
		from data_change_histories
		where actor_user_id = $1 and entity_type <> 'admin_user_data_view'
		order by created_at desc
		limit 100
	`, targetUserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user data query failed")
		return
	}
	defer rows.Close()
	response.Items = []adminUserDataRecord{}
	for rows.Next() {
		var item adminUserDataRecord
		var occurredAt time.Time
		var snapshot []byte
		if err := rows.Scan(&item.EntityType, &item.EntityID, &item.Action, &occurredAt, &snapshot); err != nil {
			writeError(w, http.StatusInternalServerError, "user data scan failed")
			return
		}
		item.MenuKey = analyticsMenuKeyForEntity(item.EntityType)
		if item.MenuKey == "" {
			item.MenuKey = "account"
		}
		item.CreatedAt = formatTime(occurredAt)
		item.Snapshot = snapshot
		response.Items = append(response.Items, item)
	}
	_, _ = a.db.Exec(r.Context(), `
		insert into admin_data_access_logs (admin_user_id, target_user_id, purpose, accessed_at)
		values ($1, $2, 'operations_customer_support', now())
	`, user.ID, targetUserID)
	writeJSON(w, http.StatusOK, response)
}

type analyticsMenuViewPayload struct {
	MenuKey string `json:"menuKey"`
}

type analyticsHourBucket struct {
	Hour     int   `json:"hour"`
	Visitors int64 `json:"visitors"`
}

type analyticsTrendBucket struct {
	Label    string `json:"label"`
	Visitors int64  `json:"visitors"`
}

type analyticsMenuBucket struct {
	MenuKey string `json:"menuKey"`
	Count   int64  `json:"count"`
}

type analyticsChangeBucket struct {
	MenuKey    string `json:"menuKey"`
	EntityType string `json:"entityType"`
	Action     string `json:"action"`
	Count      int64  `json:"count"`
}

type analyticsActivityItem struct {
	OccurredAt string `json:"occurredAt"`
	Actor      string `json:"actor"`
	ActorLogin string `json:"actorLogin,omitempty"`
	MenuKey    string `json:"menuKey"`
	EventType  string `json:"eventType"`
	EntityType string `json:"entityType,omitempty"`
	Action     string `json:"action"`
	Route      string `json:"route,omitempty"`
}

type analyticsRegistrationItem struct {
	ID        int64  `json:"id"`
	LoginID   string `json:"loginId"`
	Nickname  string `json:"nickname"`
	Provider  string `json:"provider"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
}

type analyticsMemberListResponse struct {
	Type     string                      `json:"type"`
	Items    []analyticsRegistrationItem `json:"items"`
	Total    int64                       `json:"total"`
	Page     int                         `json:"page"`
	PageSize int                         `json:"pageSize"`
}

type analyticsDashboardResponse struct {
	Date                string                      `json:"date"`
	Period              string                      `json:"period"`
	RangeStart          string                      `json:"rangeStart"`
	RangeEnd            string                      `json:"rangeEnd"`
	Visitors            int64                       `json:"visitors"`
	ActiveUsers         int64                       `json:"activeUsers"`
	RegisteredUsers     int64                       `json:"registeredUsers"`
	WithdrawnUsers      int64                       `json:"withdrawnUsers"`
	VisitorsByHour      []analyticsHourBucket       `json:"visitorsByHour"`
	VisitorTrend        []analyticsTrendBucket      `json:"visitorTrend"`
	MenuAccess          []analyticsMenuBucket       `json:"menuAccess"`
	DataChanges         []analyticsChangeBucket     `json:"dataChanges"`
	RecentRegistrations []analyticsRegistrationItem `json:"recentRegistrations"`
	RecentActivity      []analyticsActivityItem     `json:"recentActivity"`
	ActivityTotal       int64                       `json:"activityTotal"`
	Page                int                         `json:"page"`
	PageSize            int                         `json:"pageSize"`
}

type analyticsActivityDetailItem struct {
	OccurredAt string `json:"occurredAt"`
	Actor      string `json:"actor"`
	ActorLogin string `json:"actorLogin,omitempty"`
	MenuKey    string `json:"menuKey"`
	EventType  string `json:"eventType"`
	EntityType string `json:"entityType,omitempty"`
	Action     string `json:"action"`
	Route      string `json:"route,omitempty"`
	EventCount int64  `json:"eventCount,omitempty"`
}

type analyticsActivityDetailResponse struct {
	Type     string                        `json:"type"`
	Items    []analyticsActivityDetailItem `json:"items"`
	Total    int64                         `json:"total"`
	Page     int                           `json:"page"`
	PageSize int                           `json:"pageSize"`
}

type analyticsActivityDetailFilter struct {
	VisitorHour *int
	MenuKey     string
	EntityType  string
	Action      string
}

var analyticsMenuKeySet = map[string]bool{
	"home":       true,
	"calendar":   true,
	"ledger":     true,
	"travel":     true,
	"baby":       true,
	"diary":      true,
	"family":     true,
	"restaurant": true,
	"community":  true,
	"hotdeal":    true,
	"admin":      true,
}

func analyticsMenuKeyForEntity(entityType string) string {
	switch entityType {
	case "ledger_entry":
		return "ledger"
	case "family_schedule", "family_schedule_exception":
		return "calendar"
	case "trip", "travel_record":
		return "travel"
	case "baby_profile", "baby_record":
		return "baby"
	case "family_diary":
		return "diary"
	case "restaurant":
		return "restaurant"
	case "community_post", "community_comment":
		return "community"
	case "common_code", "common_code_group":
		return "admin"
	default:
		return ""
	}
}

func analyticsMenuKeyForRoute(route string) string {
	switch {
	case strings.HasPrefix(route, "/api/ledger"):
		return "ledger"
	case strings.HasPrefix(route, "/api/schedules"), strings.HasPrefix(route, "/api/holidays"):
		return "calendar"
	case strings.HasPrefix(route, "/api/trips"), strings.HasPrefix(route, "/api/travel-records"):
		return "travel"
	case strings.HasPrefix(route, "/api/babies"), strings.HasPrefix(route, "/api/baby-records"):
		return "baby"
	case strings.HasPrefix(route, "/api/diaries"):
		return "diary"
	case strings.HasPrefix(route, "/api/restaurants"):
		return "restaurant"
	case strings.HasPrefix(route, "/api/community"):
		return "community"
	case strings.HasPrefix(route, "/api/families"), strings.HasPrefix(route, "/api/family-invitations"):
		return "family"
	case strings.HasPrefix(route, "/api/common-code"), strings.HasPrefix(route, "/api/admin"):
		return "admin"
	default:
		return ""
	}
}

func (a *app) recordActivityEvent(ctx context.Context, userID int64, eventType, menuKey, route, method string, statusCode int) {
	if a.isPlatformAdminHistoryActor(ctx, &userID, "") {
		return
	}
	_, _ = a.db.Exec(ctx, `
		insert into app_activity_events (user_id, event_type, menu_key, route, http_method, status_code, occurred_at)
		values ($1, $2, $3, $4, $5, $6, now())
	`, userID, eventType, menuKey, route, method, statusCode)
}

func activityRoute(r *http.Request) string {
	if pattern := strings.TrimSpace(r.Pattern); pattern != "" {
		if space := strings.IndexByte(pattern, ' '); space >= 0 {
			return strings.TrimSpace(pattern[space+1:])
		}
		return pattern
	}
	return strings.TrimSpace(r.URL.Path)
}

func shouldRecordDataViewActivity(r *http.Request) bool {
	if r.Method != http.MethodGet {
		return false
	}
	return analyticsMenuKeyForRoute(activityRoute(r)) != ""
}

func (a *app) recordMenuView(w http.ResponseWriter, r *http.Request, user authUser) {
	var req analyticsMenuViewPayload
	if !readJSON(w, r, &req) {
		return
	}
	menuKey := strings.TrimSpace(req.MenuKey)
	if !analyticsMenuKeySet[menuKey] {
		writeError(w, http.StatusBadRequest, "invalid menu key")
		return
	}
	if user.PlatformAdmin {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	a.recordActivityEvent(r.Context(), user.ID, "menu_view", menuKey, "", "", http.StatusNoContent)
	w.WriteHeader(http.StatusNoContent)
}

type pushDevicePayload struct {
	DeviceID string `json:"deviceId"`
	Token    string `json:"token"`
	Platform string `json:"platform"`
}

type notificationPreferencesPayload struct {
	MorningSchedulePushEnabled bool `json:"morningSchedulePushEnabled"`
}

func (a *app) getNotificationPreferences(w http.ResponseWriter, r *http.Request, user authUser) {
	preference := notificationPreferencesPayload{MorningSchedulePushEnabled: true}
	err := a.db.QueryRow(r.Context(), `
		select morning_schedule_push_enabled
		from notification_preferences
		where user_id = $1
	`, user.ID).Scan(&preference.MorningSchedulePushEnabled)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "notification preference read failed")
		return
	}
	writeJSON(w, http.StatusOK, preference)
}

func (a *app) updateNotificationPreferences(w http.ResponseWriter, r *http.Request, user authUser) {
	var preference notificationPreferencesPayload
	if !readJSON(w, r, &preference) {
		return
	}
	_, err := a.db.Exec(r.Context(), `
		insert into notification_preferences (user_id, morning_schedule_push_enabled, updated_at)
		values ($1, $2, now())
		on conflict (user_id) do update
		set morning_schedule_push_enabled = excluded.morning_schedule_push_enabled,
			updated_at = now()
	`, user.ID, preference.MorningSchedulePushEnabled)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "notification preference save failed")
		return
	}
	writeJSON(w, http.StatusOK, preference)
}

func (a *app) registerPushDevice(w http.ResponseWriter, r *http.Request, user authUser) {
	var req pushDevicePayload
	if !readJSON(w, r, &req) {
		return
	}
	req.DeviceID = strings.TrimSpace(req.DeviceID)
	req.Token = strings.TrimSpace(req.Token)
	if req.DeviceID == "" || req.Token == "" || len(req.DeviceID) > 128 || len(req.Token) > 4096 {
		writeError(w, http.StatusBadRequest, "device id and token are required")
		return
	}
	platform := strings.ToLower(strings.TrimSpace(req.Platform))
	if platform == "" {
		platform = "android"
	}
	_, err := a.db.Exec(r.Context(), `
		insert into push_devices (user_id, device_id, token, platform, active, updated_at, created_at)
		values ($1, $2, $3, $4, true, now(), now())
		on conflict (user_id, device_id) do update set token = excluded.token, platform = excluded.platform, active = true, updated_at = now()
	`, user.ID, req.DeviceID, req.Token, platform)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "push device save failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) deactivatePushDevice(w http.ResponseWriter, r *http.Request, user authUser) {
	deviceID := strings.TrimSpace(r.PathValue("deviceId"))
	if deviceID == "" {
		writeError(w, http.StatusBadRequest, "device id is required")
		return
	}
	_, err := a.db.Exec(r.Context(), "update push_devices set active = false, updated_at = now() where user_id = $1 and device_id = $2", user.ID, deviceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "push device update failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func analyticsDayBounds(value string) (time.Time, time.Time, error) {
	location, err := time.LoadLocation("Asia/Seoul")
	if err != nil {
		location = time.FixedZone("Asia/Seoul", 9*60*60)
	}
	date, err := time.ParseInLocation("2006-01-02", value, location)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	return date, date.AddDate(0, 0, 1), nil
}

func analyticsBounds(value, period string) (time.Time, time.Time, string, error) {
	start, _, err := analyticsDayBounds(value)
	if err != nil {
		return time.Time{}, time.Time{}, "", err
	}
	switch period {
	case "", "day":
		return start, start.AddDate(0, 0, 1), "day", nil
	case "week":
		offset := (int(start.Weekday()) + 6) % 7
		start = start.AddDate(0, 0, -offset)
		return start, start.AddDate(0, 0, 7), "week", nil
	case "month":
		start = time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, start.Location())
		return start, start.AddDate(0, 1, 0), "month", nil
	case "year":
		start = time.Date(start.Year(), time.January, 1, 0, 0, 0, 0, start.Location())
		return start, start.AddDate(1, 0, 0), "year", nil
	default:
		return time.Time{}, time.Time{}, "", fmt.Errorf("period is invalid")
	}
}

func analyticsPagination(r *http.Request) (int, int) {
	page := 1
	pageSize := 30
	if value, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("page"))); err == nil && value > 0 {
		page = value
	}
	if value, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("pageSize"))); err == nil {
		switch value {
		case 10, 30, 50, 100:
			pageSize = value
		}
	}
	return page, pageSize
}

func analyticsToday() string {
	location, err := time.LoadLocation("Asia/Seoul")
	if err != nil {
		location = time.FixedZone("Asia/Seoul", 9*60*60)
	}
	return time.Now().In(location).Format("2006-01-02")
}

func (a *app) analyticsDashboard(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	date := strings.TrimSpace(r.URL.Query().Get("date"))
	if date == "" {
		date = analyticsToday()
	}
	start, end, period, err := analyticsBounds(date, strings.TrimSpace(r.URL.Query().Get("period")))
	if err != nil {
		writeError(w, http.StatusBadRequest, "date or period is invalid")
		return
	}
	page, pageSize := analyticsPagination(r)
	userQuery := strings.TrimSpace(r.URL.Query().Get("userQuery"))
	response := analyticsDashboardResponse{
		Date:                date,
		Period:              period,
		RangeStart:          start.Format("2006-01-02"),
		RangeEnd:            end.AddDate(0, 0, -1).Format("2006-01-02"),
		VisitorsByHour:      make([]analyticsHourBucket, 24),
		VisitorTrend:        []analyticsTrendBucket{},
		MenuAccess:          []analyticsMenuBucket{},
		DataChanges:         []analyticsChangeBucket{},
		RecentRegistrations: []analyticsRegistrationItem{},
		RecentActivity:      []analyticsActivityItem{},
		Page:                page,
		PageSize:            pageSize,
	}
	for hour := 0; hour < 24; hour++ {
		response.VisitorsByHour[hour] = analyticsHourBucket{Hour: hour}
	}
	if err := a.loadUserRegistrationStats(r.Context(), start, end, &response); err != nil {
		writeError(w, http.StatusInternalServerError, "user registration statistics read failed")
		return
	}
	cutoff := time.Now().AddDate(0, 0, -a.cfg.activityHistoryRetentionDays)
	if end.Before(cutoff) && period == "day" && userQuery == "" {
		a.loadAggregatedAnalytics(r.Context(), start, &response)
		for _, item := range response.VisitorsByHour {
			response.Visitors += item.Visitors
			response.VisitorTrend = append(response.VisitorTrend, analyticsTrendBucket{Label: fmt.Sprintf("%02d", item.Hour), Visitors: item.Visitors})
		}
		writeJSON(w, http.StatusOK, response)
		return
	}
	a.loadRawAnalytics(r.Context(), start, end, period, userQuery, &response)
	writeJSON(w, http.StatusOK, response)
}

func (a *app) analyticsMembers(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}
	detailType := strings.TrimSpace(r.URL.Query().Get("type"))
	if detailType != "active" && detailType != "registered" {
		writeError(w, http.StatusBadRequest, "analytics member type is invalid")
		return
	}
	date := strings.TrimSpace(r.URL.Query().Get("date"))
	if date == "" {
		date = analyticsToday()
	}
	start, end, _, err := analyticsBounds(date, strings.TrimSpace(r.URL.Query().Get("period")))
	if err != nil {
		writeError(w, http.StatusBadRequest, "date or period is invalid")
		return
	}
	page, pageSize := analyticsPagination(r)
	userQuery := strings.TrimSpace(r.URL.Query().Get("userQuery"))
	matcher := "%" + userQuery + "%"
	where := "($1 = '' or coalesce(nickname, '') ilike $2 or coalesce(login_id, '') ilike $2 or coalesce(email, '') ilike $2)"
	args := []any{userQuery, matcher}
	if detailType == "active" {
		where = "deleted_at is null and " + where
	} else {
		where = "created_at >= $3 and created_at < $4 and " + where
		args = append(args, start, end)
	}
	var total int64
	if err := a.db.QueryRow(r.Context(), "select count(*) from app_users where "+where, args...).Scan(&total); err != nil {
		writeError(w, http.StatusInternalServerError, "analytics member count read failed")
		return
	}
	args = append(args, pageSize, (page-1)*pageSize)
	limitPosition := len(args) - 1
	offsetPosition := len(args)
	rows, err := a.db.Query(r.Context(), `
		select id, coalesce(login_id, ''), coalesce(nickname, ''), coalesce(provider, ''),
			case when deleted_at is null then 'ACTIVE' else 'WITHDRAWN' end, created_at
		from app_users
		where `+where+`
		order by created_at desc, id desc
		limit $`+strconv.Itoa(limitPosition)+` offset $`+strconv.Itoa(offsetPosition), args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "analytics member list read failed")
		return
	}
	defer rows.Close()
	response := analyticsMemberListResponse{Type: detailType, Items: []analyticsRegistrationItem{}, Total: total, Page: page, PageSize: pageSize}
	for rows.Next() {
		var item analyticsRegistrationItem
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.LoginID, &item.Nickname, &item.Provider, &item.Status, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "analytics member row read failed")
			return
		}
		item.CreatedAt = formatTime(createdAt)
		response.Items = append(response.Items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "analytics member list read failed")
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (a *app) loadUserRegistrationStats(ctx context.Context, start, end time.Time, response *analyticsDashboardResponse) error {
	if err := a.db.QueryRow(ctx, `
		select
			count(*) filter (where deleted_at is null),
			count(*) filter (where created_at >= $1 and created_at < $2),
			count(*) filter (where deleted_at is not null)
		from app_users
	`, start, end).Scan(&response.ActiveUsers, &response.RegisteredUsers, &response.WithdrawnUsers); err != nil {
		return err
	}
	rows, err := a.db.Query(ctx, `
		select id, coalesce(login_id, ''), coalesce(nickname, ''), coalesce(provider, ''),
			case when deleted_at is null then 'ACTIVE' else 'WITHDRAWN' end, created_at
		from app_users
		where created_at >= $1 and created_at < $2
		order by created_at desc, id desc
		limit 20
	`, start, end)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var item analyticsRegistrationItem
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.LoginID, &item.Nickname, &item.Provider, &item.Status, &createdAt); err != nil {
			return err
		}
		item.CreatedAt = formatTime(createdAt)
		response.RecentRegistrations = append(response.RecentRegistrations, item)
	}
	return rows.Err()
}

func (a *app) analyticsActivityDetails(w http.ResponseWriter, r *http.Request, user authUser) {
	if !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return
	}

	detailType := strings.TrimSpace(r.URL.Query().Get("type"))
	if detailType != "visitor" && detailType != "menu" && detailType != "change" {
		writeError(w, http.StatusBadRequest, "analytics detail type is invalid")
		return
	}

	date := strings.TrimSpace(r.URL.Query().Get("date"))
	if date == "" {
		date = analyticsToday()
	}
	start, end, _, err := analyticsBounds(date, strings.TrimSpace(r.URL.Query().Get("period")))
	if err != nil {
		writeError(w, http.StatusBadRequest, "date or period is invalid")
		return
	}

	page, pageSize := analyticsPagination(r)
	userQuery := strings.TrimSpace(r.URL.Query().Get("userQuery"))
	filter := analyticsActivityDetailFilter{}
	if rawHour := strings.TrimSpace(r.URL.Query().Get("hour")); rawHour != "" {
		if detailType != "visitor" {
			writeError(w, http.StatusBadRequest, "hour filter is only available for visitors")
			return
		}
		hour, parseErr := strconv.Atoi(rawHour)
		if parseErr != nil || hour < 0 || hour > 23 {
			writeError(w, http.StatusBadRequest, "hour is invalid")
			return
		}
		filter.VisitorHour = &hour
	}
	if menuKey := strings.TrimSpace(r.URL.Query().Get("menuKey")); menuKey != "" {
		if detailType != "menu" || !analyticsMenuKeySet[menuKey] {
			writeError(w, http.StatusBadRequest, "menu key is invalid")
			return
		}
		filter.MenuKey = menuKey
	}
	if entityType := strings.TrimSpace(r.URL.Query().Get("entityType")); entityType != "" {
		if detailType != "change" || len(entityType) > 80 {
			writeError(w, http.StatusBadRequest, "entity type is invalid")
			return
		}
		filter.EntityType = entityType
	}
	if action := strings.TrimSpace(r.URL.Query().Get("action")); action != "" {
		if detailType != "change" || (action != "create" && action != "update" && action != "delete" && action != "withdraw") {
			writeError(w, http.StatusBadRequest, "action is invalid")
			return
		}
		filter.Action = action
	}
	response := analyticsActivityDetailResponse{
		Type:     detailType,
		Items:    []analyticsActivityDetailItem{},
		Page:     page,
		PageSize: pageSize,
	}
	a.loadAnalyticsActivityDetails(r.Context(), detailType, start, end, userQuery, filter, &response)
	writeJSON(w, http.StatusOK, response)
}

func (a *app) loadAnalyticsActivityDetails(ctx context.Context, detailType string, start, end time.Time, userQuery string, filter analyticsActivityDetailFilter, response *analyticsActivityDetailResponse) {
	userMatcher := "%" + userQuery + "%"
	userFilter := "($3 = '' or coalesce(u.nickname, '') ilike $4 or coalesce(u.email, '') ilike $4 or coalesce(u.login_id, '') ilike $4)"
	var source string
	queryArgs := []any{start, end, userQuery, userMatcher}
	nextArgument := func(value any) string {
		queryArgs = append(queryArgs, value)
		return fmt.Sprintf("$%d", len(queryArgs))
	}
	visitorHourFilter := ""
	if filter.VisitorHour != nil {
		visitorHourFilter = " where extract(hour from latest.created_at at time zone 'Asia/Seoul') = " + nextArgument(*filter.VisitorHour)
	}

	switch detailType {
	case "visitor":
		source = `
			from (
				select latest.created_at as occurred_at,
					latest.actor,
					latest.actor_login,
					''::varchar as menu_key,
					latest.provider as action,
					1::bigint as event_count
				from (
					select distinct on (coalesce('user:' || l.user_id::text, 'email:' || lower(l.email), 'history:' || l.id::text))
						l.created_at,
						coalesce(nullif(u.nickname, ''), nullif(u.login_id, ''), nullif(u.email, ''), '탈퇴 회원') as actor,
						coalesce(u.email, u.login_id, l.email, '') as actor_login,
						l.provider
					from login_histories l
					left join app_users u on u.id = l.user_id
					where l.event_type in ('LOGIN', 'SSO_LOGIN', 'SESSION_RESTORE') and l.result = 'SUCCESS'
						and l.created_at >= $1 and l.created_at < $2
						and ` + userFilter + `
					order by coalesce('user:' || l.user_id::text, 'email:' || lower(l.email), 'history:' || l.id::text), l.created_at desc, l.id desc
				) latest` + visitorHourFilter + `
			) activity
		`
	case "menu":
		menuFilter := ""
		if filter.MenuKey != "" {
			menuFilter = " and e.menu_key = " + nextArgument(filter.MenuKey)
		}
		source = `
			from (
				select e.occurred_at,
					coalesce(nullif(u.nickname, ''), nullif(u.login_id, ''), nullif(u.email, ''), '탈퇴 회원') as actor,
					coalesce(u.email, u.login_id, '') as actor_login,
					e.menu_key, e.http_method as action, e.route
				from app_activity_events e
				left join app_users u on u.id = e.user_id
				where e.event_type = 'menu_view' and e.occurred_at >= $1 and e.occurred_at < $2
					and ` + userFilter + menuFilter + `
			) activity
		`
	case "change":
		changeFilter := ""
		if filter.EntityType != "" {
			changeFilter += " and h.entity_type = " + nextArgument(filter.EntityType)
		}
		if filter.Action != "" {
			changeFilter += " and h.action = " + nextArgument(filter.Action)
		}
		source = `
			from (
				select h.created_at as occurred_at,
					coalesce(nullif(u.nickname, ''), nullif(u.login_id, ''), nullif(u.email, ''), '탈퇴 회원') as actor,
					coalesce(u.email, u.login_id, '') as actor_login,
					h.entity_type, h.action
				from data_change_histories h
				left join app_users u on u.id = h.actor_user_id
				where h.created_at >= $1 and h.created_at < $2
					and ` + userFilter + changeFilter + `
			) activity
		`
	}

	_ = a.db.QueryRow(ctx, "select count(*) "+source, queryArgs...).Scan(&response.Total)
	offset := (response.Page - 1) * response.PageSize
	limitArgument := fmt.Sprintf("$%d", len(queryArgs)+1)
	offsetArgument := fmt.Sprintf("$%d", len(queryArgs)+2)
	queryArgs = append(queryArgs, response.PageSize, offset)
	var rows pgx.Rows
	var err error
	switch detailType {
	case "visitor":
		rows, err = a.db.Query(ctx, `
			select occurred_at, actor, actor_login, menu_key, action, event_count
			`+source+`
			order by occurred_at desc, actor asc
			limit `+limitArgument+` offset `+offsetArgument+`
		`, queryArgs...)
	case "menu":
		rows, err = a.db.Query(ctx, `
			select occurred_at, actor, actor_login, menu_key, action, route
			`+source+`
			order by occurred_at desc
			limit `+limitArgument+` offset `+offsetArgument+`
		`, queryArgs...)
	case "change":
		rows, err = a.db.Query(ctx, `
			select occurred_at, actor, actor_login, entity_type, action
			`+source+`
			order by occurred_at desc
			limit `+limitArgument+` offset `+offsetArgument+`
		`, queryArgs...)
	}
	if err != nil || rows == nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var item analyticsActivityDetailItem
		var occurredAt time.Time
		switch detailType {
		case "visitor":
			if rows.Scan(&occurredAt, &item.Actor, &item.ActorLogin, &item.MenuKey, &item.Action, &item.EventCount) != nil {
				continue
			}
			item.EventType = "login"
		case "menu":
			if rows.Scan(&occurredAt, &item.Actor, &item.ActorLogin, &item.MenuKey, &item.Action, &item.Route) != nil {
				continue
			}
			item.EventType = "menu_view"
		case "change":
			if rows.Scan(&occurredAt, &item.Actor, &item.ActorLogin, &item.EntityType, &item.Action) != nil {
				continue
			}
			item.EventType = "data_change"
			item.MenuKey = analyticsMenuKeyForEntity(item.EntityType)
		}
		item.OccurredAt = formatTime(occurredAt)
		response.Items = append(response.Items, item)
	}
}

func (a *app) loadRawAnalytics(ctx context.Context, start, end time.Time, period, userQuery string, response *analyticsDashboardResponse) {
	userMatcher := "%" + userQuery + "%"
	userFilter := "($3 = '' or coalesce(u.nickname, '') ilike $4 or coalesce(u.email, '') ilike $4 or coalesce(u.login_id, '') ilike $4)"
	visitorLatestSource := `
		from (
			select distinct on (coalesce('user:' || l.user_id::text, 'email:' || lower(l.email), 'history:' || l.id::text))
				l.created_at
			from login_histories l
			left join app_users u on u.id = l.user_id
			where l.event_type in ('LOGIN', 'SSO_LOGIN', 'SESSION_RESTORE') and l.result = 'SUCCESS'
				and l.created_at >= $1 and l.created_at < $2
				and ` + userFilter + `
			order by coalesce('user:' || l.user_id::text, 'email:' || lower(l.email), 'history:' || l.id::text), l.created_at desc, l.id desc
		) latest
	`

	_ = a.db.QueryRow(ctx, "select count(*) "+visitorLatestSource, start, end, userQuery, userMatcher).Scan(&response.Visitors)

	trendExpression := "to_char(latest.created_at at time zone 'Asia/Seoul', 'MM/DD')"
	if period == "day" {
		trendExpression = "to_char(latest.created_at at time zone 'Asia/Seoul', 'HH24')"
	} else if period == "year" {
		trendExpression = "to_char(latest.created_at at time zone 'Asia/Seoul', 'YYYY-MM')"
	}
	trendRows, err := a.db.Query(ctx, `
		select `+trendExpression+`, count(*)
		`+visitorLatestSource+`
		group by 1
		order by 1
	`, start, end, userQuery, userMatcher)
	if err == nil {
		defer trendRows.Close()
		for trendRows.Next() {
			var item analyticsTrendBucket
			if trendRows.Scan(&item.Label, &item.Visitors) == nil {
				response.VisitorTrend = append(response.VisitorTrend, item)
			}
		}
	}
	if period == "day" {
		for _, item := range response.VisitorTrend {
			if hour, err := strconv.Atoi(item.Label); err == nil && hour >= 0 && hour < len(response.VisitorsByHour) {
				response.VisitorsByHour[hour].Visitors = item.Visitors
			}
		}
	}

	menuRows, err := a.db.Query(ctx, `
		select e.menu_key, count(*)
		from app_activity_events e
		left join app_users u on u.id = e.user_id
		where e.event_type = 'menu_view' and e.occurred_at >= $1 and e.occurred_at < $2
			and `+userFilter+`
		group by e.menu_key
		order by count(*) desc, e.menu_key asc
	`, start, end, userQuery, userMatcher)
	if err == nil {
		defer menuRows.Close()
		for menuRows.Next() {
			var item analyticsMenuBucket
			if menuRows.Scan(&item.MenuKey, &item.Count) == nil {
				response.MenuAccess = append(response.MenuAccess, item)
			}
		}
	}

	changeRows, err := a.db.Query(ctx, `
		select h.entity_type, h.action, count(*)
		from data_change_histories h
		left join app_users u on u.id = h.actor_user_id
		where h.created_at >= $1 and h.created_at < $2
			and `+userFilter+`
		group by h.entity_type, h.action
		order by count(*) desc, h.entity_type asc, h.action asc
	`, start, end, userQuery, userMatcher)
	if err == nil {
		defer changeRows.Close()
		for changeRows.Next() {
			var item analyticsChangeBucket
			if changeRows.Scan(&item.EntityType, &item.Action, &item.Count) == nil {
				item.MenuKey = analyticsMenuKeyForEntity(item.EntityType)
				response.DataChanges = append(response.DataChanges, item)
			}
		}
	}

	activitySource := `
		from (
			select e.occurred_at,
				coalesce(nullif(u.nickname, ''), nullif(u.login_id, ''), nullif(u.email, ''), 'withdrawn user') as actor,
				coalesce(u.email, u.login_id, '') as actor_login,
				e.menu_key, e.event_type, ''::varchar as entity_type, e.http_method as action, e.route
			from app_activity_events e
			left join app_users u on u.id = e.user_id
			where e.occurred_at >= $1 and e.occurred_at < $2
			union all
			select h.created_at,
				coalesce(nullif(u.nickname, ''), nullif(u.login_id, ''), nullif(u.email, ''), 'withdrawn user') as actor,
				coalesce(u.email, u.login_id, '') as actor_login,
				''::varchar as menu_key, 'data_change'::varchar as event_type, h.entity_type, h.action, ''::varchar as route
			from data_change_histories h
			left join app_users u on u.id = h.actor_user_id
			where h.created_at >= $1 and h.created_at < $2
		) activity
		where ($3 = '' or actor ilike $4 or actor_login ilike $4)
	`
	_ = a.db.QueryRow(ctx, "select count(*) "+activitySource, start, end, userQuery, userMatcher).Scan(&response.ActivityTotal)
	offset := (response.Page - 1) * response.PageSize
	activityRows, err := a.db.Query(ctx, `
		select occurred_at, actor, actor_login, menu_key, event_type, entity_type, action, route
	`+activitySource+`
		order by occurred_at desc
		limit $5 offset $6
	`, start, end, userQuery, userMatcher, response.PageSize, offset)
	if err != nil {
		return
	}
	defer activityRows.Close()
	for activityRows.Next() {
		var item analyticsActivityItem
		var occurredAt time.Time
		if activityRows.Scan(&occurredAt, &item.Actor, &item.ActorLogin, &item.MenuKey, &item.EventType, &item.EntityType, &item.Action, &item.Route) != nil {
			continue
		}
		if item.MenuKey == "" {
			item.MenuKey = analyticsMenuKeyForEntity(item.EntityType)
		}
		item.OccurredAt = formatTime(occurredAt)
		response.RecentActivity = append(response.RecentActivity, item)
	}
}

func (a *app) loadRawAnalyticsLegacy(ctx context.Context, start, end time.Time, response *analyticsDashboardResponse) {
	visitorRows, err := a.db.Query(ctx, `
		select extract(hour from occurred_at at time zone 'Asia/Seoul')::int, count(*)
		from app_activity_events
		where event_type = 'menu_view' and occurred_at >= $1 and occurred_at < $2
		group by 1
	`, start, end)
	if err == nil {
		defer visitorRows.Close()
		for visitorRows.Next() {
			var hour int
			var visitors int64
			if visitorRows.Scan(&hour, &visitors) == nil && hour >= 0 && hour < len(response.VisitorsByHour) {
				response.VisitorsByHour[hour].Visitors = visitors
			}
		}
	}

	menuRows, err := a.db.Query(ctx, `
		select menu_key, count(*)
		from app_activity_events
		where event_type = 'menu_view' and occurred_at >= $1 and occurred_at < $2
		group by menu_key
		order by count(*) desc, menu_key asc
	`, start, end)
	if err == nil {
		defer menuRows.Close()
		for menuRows.Next() {
			var item analyticsMenuBucket
			if menuRows.Scan(&item.MenuKey, &item.Count) == nil {
				response.MenuAccess = append(response.MenuAccess, item)
			}
		}
	}

	changeRows, err := a.db.Query(ctx, `
		select entity_type, action, count(*)
		from data_change_histories
		where created_at >= $1 and created_at < $2
		group by entity_type, action
		order by count(*) desc, entity_type asc, action asc
	`, start, end)
	if err == nil {
		defer changeRows.Close()
		for changeRows.Next() {
			var item analyticsChangeBucket
			if changeRows.Scan(&item.EntityType, &item.Action, &item.Count) == nil {
				item.MenuKey = analyticsMenuKeyForEntity(item.EntityType)
				response.DataChanges = append(response.DataChanges, item)
			}
		}
	}

	activityRows, err := a.db.Query(ctx, `
		select occurred_at, actor, actor_login, menu_key, event_type, entity_type, action, route
		from (
			select e.occurred_at,
				coalesce(nullif(u.nickname, ''), nullif(u.login_id, ''), nullif(u.email, ''), '탈퇴 회원') as actor,
				coalesce(u.email, u.login_id, '') as actor_login,
				e.menu_key, e.event_type, ''::varchar as entity_type, e.http_method as action, e.route
			from app_activity_events e
			left join app_users u on u.id = e.user_id
			where e.occurred_at >= $1 and e.occurred_at < $2
			union all
			select h.created_at,
				coalesce(nullif(u.nickname, ''), nullif(u.login_id, ''), nullif(u.email, ''), '탈퇴 회원') as actor,
				coalesce(u.email, u.login_id, '') as actor_login,
				''::varchar as menu_key, 'data_change'::varchar as event_type, h.entity_type, h.action, ''::varchar as route
			from data_change_histories h
			left join app_users u on u.id = h.actor_user_id
			where h.created_at >= $1 and h.created_at < $2
		) activity
		order by occurred_at desc
		limit 100
	`, start, end)
	if err != nil {
		return
	}
	defer activityRows.Close()
	for activityRows.Next() {
		var item analyticsActivityItem
		var occurredAt time.Time
		if activityRows.Scan(&occurredAt, &item.Actor, &item.ActorLogin, &item.MenuKey, &item.EventType, &item.EntityType, &item.Action, &item.Route) != nil {
			continue
		}
		if item.MenuKey == "" {
			item.MenuKey = analyticsMenuKeyForEntity(item.EntityType)
		}
		item.OccurredAt = formatTime(occurredAt)
		response.RecentActivity = append(response.RecentActivity, item)
	}
}

func (a *app) loadAggregatedAnalytics(ctx context.Context, start time.Time, response *analyticsDashboardResponse) {
	visitorRows, err := a.db.Query(ctx, `
		select aggregate_hour, event_count
		from app_activity_daily_aggregates
		where aggregate_date = $1 and metric_type = 'visitor'
	`, start)
	if err == nil {
		defer visitorRows.Close()
		for visitorRows.Next() {
			var hour int
			var visitors int64
			if visitorRows.Scan(&hour, &visitors) == nil && hour >= 0 && hour < len(response.VisitorsByHour) {
				response.VisitorsByHour[hour].Visitors = visitors
			}
		}
	}
	menuRows, err := a.db.Query(ctx, `
		select menu_key, sum(event_count)
		from app_activity_daily_aggregates
		where aggregate_date = $1 and metric_type = 'menu_view'
		group by menu_key
		order by sum(event_count) desc, menu_key asc
	`, start)
	if err == nil {
		defer menuRows.Close()
		for menuRows.Next() {
			var item analyticsMenuBucket
			if menuRows.Scan(&item.MenuKey, &item.Count) == nil {
				response.MenuAccess = append(response.MenuAccess, item)
			}
		}
	}
	changeRows, err := a.db.Query(ctx, `
		select menu_key, entity_type, action, sum(event_count)
		from app_activity_daily_aggregates
		where aggregate_date = $1 and metric_type = 'data_change'
		group by menu_key, entity_type, action
		order by sum(event_count) desc, entity_type asc, action asc
	`, start)
	if err == nil {
		defer changeRows.Close()
		for changeRows.Next() {
			var item analyticsChangeBucket
			if changeRows.Scan(&item.MenuKey, &item.EntityType, &item.Action, &item.Count) == nil {
				response.DataChanges = append(response.DataChanges, item)
			}
		}
	}
}

func (a *app) startExpiredUnverifiedAccountPurgeJob(ctx context.Context) {
	go func() {
		run := func() {
			result, err := a.runManagedBatch(context.Background(), "unverified-account-purge", "SCHEDULED", nil)
			if err != nil {
				a.log.Error("expired unverified account purge failed", "error", err)
				return
			}
			if result.ProcessedCount > 0 {
				a.log.Info("expired unverified accounts released", "count", result.ProcessedCount)
			}
		}

		run()
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				run()
			}
		}
	}()
}

func (a *app) releaseExpiredUnverifiedAccounts(ctx context.Context) {
	if _, err := a.purgeExpiredUnverifiedAccounts(ctx); err != nil {
		a.log.Warn("expired unverified account release failed", "error", err)
	}
}

func (a *app) purgeExpiredUnverifiedAccounts(ctx context.Context) (int64, error) {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		select u.id
		from app_users u
		where u.deleted_at is null
		  and u.email_verification_required = true
		  and u.email_verified_at is null
		  and not exists (
			select 1
			from email_verification_tokens t
			where t.user_id = u.id
			  and t.used_at is null
			  and t.expires_at > now()
		  )
		order by u.id asc
		limit 500
		for update
	`)
	if err != nil {
		return 0, err
	}
	userIDs := []int64{}
	for rows.Next() {
		var userID int64
		if err := rows.Scan(&userID); err != nil {
			rows.Close()
			return 0, err
		}
		userIDs = append(userIDs, userID)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(userIDs) == 0 {
		if err := tx.Commit(ctx); err != nil {
			return 0, err
		}
		return 0, nil
	}

	if _, err := tx.Exec(ctx, "delete from email_verification_tokens where user_id = any($1)", userIDs); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, "delete from password_reset_tokens where user_id = any($1)", userIDs); err != nil {
		return 0, err
	}
	tag, err := tx.Exec(ctx, `
		update app_users
		set email = null,
		    login_id = null,
		    nickname = 'expired-unverified-' || id::text,
		    password_hash = null,
		    active_session_id = null,
		    active_session_expires_at = null,
		    locked_until = null,
		    failed_login_attempts = 0,
		    email_verification_required = false,
		    deleted_at = now()
		where id = any($1)
		  and deleted_at is null
	`, userIDs)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (a *app) startWithdrawnAccountPurgeJob(ctx context.Context) {
	a.startDailyBatchJob(ctx, "withdrawn-account-purge", 3, 20)
}

func (a *app) purgeWithdrawnAccounts(ctx context.Context) (int64, error) {
	retentionDays := a.cfg.withdrawnAccountRetentionDays
	if retentionDays <= 0 {
		return 0, nil
	}
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		select id
		from app_users
		where deleted_at is not null and deleted_at < $1
		order by deleted_at asc, id asc
		limit 500
	`, cutoff)
	if err != nil {
		return 0, err
	}
	userIDs := []int64{}
	for rows.Next() {
		var userID int64
		if err := rows.Scan(&userID); err != nil {
			rows.Close()
			return 0, err
		}
		userIDs = append(userIDs, userID)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(userIDs) == 0 {
		if err := tx.Commit(ctx); err != nil {
			return 0, err
		}
		return 0, nil
	}
	if _, err := tx.Exec(ctx, "delete from login_histories where user_id = any($1)", userIDs); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, "update data_change_histories set actor_user_id = null where actor_user_id = any($1)", userIDs); err != nil {
		return 0, err
	}
	tag, err := tx.Exec(ctx, "delete from app_users where id = any($1) and deleted_at is not null and deleted_at < $2", userIDs, cutoff)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (a *app) startActivityHistoryPurgeJob(ctx context.Context) {
	a.startDailyBatchJob(ctx, "history-purge", 3, 40)
}

func (a *app) purgePlatformAdminHistories(ctx context.Context) (int64, error) {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	activityTag, err := tx.Exec(ctx, `
		delete from app_activity_events e
		using app_users u
		where e.user_id = u.id and u.platform_admin = true
	`)
	if err != nil {
		return 0, err
	}
	changeTag, err := tx.Exec(ctx, `
		delete from data_change_histories h
		using app_users u
		where h.actor_user_id = u.id and u.platform_admin = true
	`)
	if err != nil {
		return 0, err
	}
	loginTag, err := tx.Exec(ctx, `
		delete from login_histories h
		where exists (
			select 1
			from app_users u
			where u.platform_admin = true
				and (
					h.user_id = u.id
					or lower(coalesce(h.email, '')) = lower(coalesce(u.email, ''))
					or lower(coalesce(h.email, '')) = lower(coalesce(u.login_id, ''))
				)
		)
	`)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return activityTag.RowsAffected() + changeTag.RowsAffected() + loginTag.RowsAffected(), nil
}

func (a *app) purgeActivityHistories(ctx context.Context) (int64, error) {
	platformAdminHistoryCount, err := a.purgePlatformAdminHistories(ctx)
	if err != nil {
		return 0, err
	}
	cutoff := time.Now().AddDate(0, 0, -a.cfg.activityHistoryRetentionDays)
	aggregateCutoff := time.Now().AddDate(0, 0, -a.cfg.activityAggregateRetentionDays)
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	queries := []string{
		`
		insert into app_activity_daily_aggregates (aggregate_date, aggregate_hour, metric_type, menu_key, entity_type, action, event_count, unique_user_count)
		select (occurred_at at time zone 'Asia/Seoul')::date, extract(hour from occurred_at at time zone 'Asia/Seoul')::smallint,
			'visitor', '', '', '', count(*)::int, count(distinct user_id)::int
		from app_activity_events
		where occurred_at < $1 and event_type = 'menu_view'
		group by 1, 2
		on conflict (aggregate_date, aggregate_hour, metric_type, menu_key, entity_type, action)
		do update set event_count = excluded.event_count, unique_user_count = excluded.unique_user_count`,
		`
		insert into app_activity_daily_aggregates (aggregate_date, aggregate_hour, metric_type, menu_key, entity_type, action, event_count, unique_user_count)
		select (occurred_at at time zone 'Asia/Seoul')::date, extract(hour from occurred_at at time zone 'Asia/Seoul')::smallint,
			'menu_view', menu_key, '', '', count(*)::int, count(distinct user_id)::int
		from app_activity_events
		where occurred_at < $1 and event_type = 'menu_view'
		group by 1, 2, menu_key
		on conflict (aggregate_date, aggregate_hour, metric_type, menu_key, entity_type, action)
		do update set event_count = excluded.event_count, unique_user_count = excluded.unique_user_count`,
		`
		insert into app_activity_daily_aggregates (aggregate_date, aggregate_hour, metric_type, menu_key, entity_type, action, event_count, unique_user_count)
		select (occurred_at at time zone 'Asia/Seoul')::date, extract(hour from occurred_at at time zone 'Asia/Seoul')::smallint,
			'api_request', menu_key, '', http_method, count(*)::int, count(distinct user_id)::int
		from app_activity_events
		where occurred_at < $1 and event_type = 'api_request'
		group by 1, 2, menu_key, http_method
		on conflict (aggregate_date, aggregate_hour, metric_type, menu_key, entity_type, action)
		do update set event_count = excluded.event_count, unique_user_count = excluded.unique_user_count`,
		`
		insert into app_activity_daily_aggregates (aggregate_date, aggregate_hour, metric_type, menu_key, entity_type, action, event_count, unique_user_count)
		select (created_at at time zone 'Asia/Seoul')::date, extract(hour from created_at at time zone 'Asia/Seoul')::smallint,
			'data_change',
			case entity_type
				when 'ledger_entry' then 'ledger'
				when 'family_schedule' then 'calendar'
				when 'family_schedule_exception' then 'calendar'
				when 'trip' then 'travel'
				when 'travel_record' then 'travel'
				when 'baby_profile' then 'baby'
				when 'baby_record' then 'baby'
				when 'family_diary' then 'diary'
				when 'restaurant' then 'restaurant'
				when 'community_post' then 'community'
				when 'community_comment' then 'community'
				when 'common_code' then 'admin'
				when 'common_code_group' then 'admin'
				else ''
			end,
			entity_type, action, count(*)::int, count(distinct actor_user_id)::int
		from data_change_histories
		where created_at < $1
		group by 1, 2, entity_type, action
		on conflict (aggregate_date, aggregate_hour, metric_type, menu_key, entity_type, action)
		do update set event_count = excluded.event_count, unique_user_count = excluded.unique_user_count`,
	}
	for _, query := range queries {
		if _, err := tx.Exec(ctx, query, cutoff); err != nil {
			return 0, err
		}
	}
	activityTag, err := tx.Exec(ctx, "delete from app_activity_events where occurred_at < $1", cutoff)
	if err != nil {
		return 0, err
	}
	changeTag, err := tx.Exec(ctx, "delete from data_change_histories where created_at < $1", cutoff)
	if err != nil {
		return 0, err
	}
	loginTag, err := tx.Exec(ctx, "delete from login_histories where created_at < $1", cutoff)
	if err != nil {
		return 0, err
	}
	batchTag, err := tx.Exec(ctx, "delete from batch_run_histories where started_at < $1", cutoff)
	if err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, "delete from app_activity_daily_aggregates where aggregate_date < $1::date", aggregateCutoff); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return platformAdminHistoryCount + activityTag.RowsAffected() + changeTag.RowsAffected() + loginTag.RowsAffected() + batchTag.RowsAffected(), nil
}

type holidaySyncResult struct {
	Years    []int  `json:"years"`
	Upserted int    `json:"upserted"`
	Skipped  bool   `json:"skipped"`
	Message  string `json:"message,omitempty"`
}

type holidayAPIResponse struct {
	XMLName xml.Name `xml:"response"`
	Header  struct {
		ResultCode string `xml:"resultCode"`
		ResultMsg  string `xml:"resultMsg"`
	} `xml:"header"`
	Body struct {
		Items struct {
			Items []holidayAPIItem `xml:"item"`
		} `xml:"items"`
	} `xml:"body"`
}

type holidayAPIItem struct {
	DateName  string `xml:"dateName"`
	IsHoliday string `xml:"isHoliday"`
	LocDate   string `xml:"locdate"`
}

func (a *app) startHolidaySyncJob(ctx context.Context) {
	a.startDailyBatchJob(ctx, "holiday-sync", 3, 0)
}

func (a *app) startMorningSchedulePushJob(ctx context.Context) {
	a.startDailyBatchJob(ctx, "schedule-morning-push", 9, 0)
}

func (a *app) startCommunityHotDealRefreshJob(ctx context.Context) {
	go func() {
		run := func() {
			result, err := a.runManagedBatch(context.Background(), "community-hotdeal-refresh", "SCHEDULED", nil)
			if err != nil {
				a.log.Warn("community hotdeal refresh failed", "error", err)
				return
			}
			a.log.Info("community hotdeal refreshed", "count", result.ProcessedCount)
		}

		run()
		ticker := time.NewTicker(30 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				run()
			}
		}
	}()
}

func nextDailyBatchRun(now time.Time, location *time.Location, hour int, minute int) time.Time {
	next := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, location)
	if !now.Before(next) {
		next = next.AddDate(0, 0, 1)
	}
	return next
}

func (a *app) startDailyBatchJob(ctx context.Context, batchKey string, hour int, minute int) {
	location, err := time.LoadLocation("Asia/Seoul")
	if err != nil {
		location = time.FixedZone("Asia/Seoul", 9*60*60)
	}
	go func() {
		for {
			nextRun := nextDailyBatchRun(time.Now().In(location), location, hour, minute)
			timer := time.NewTimer(time.Until(nextRun))
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
				if _, err := a.runManagedBatch(context.Background(), batchKey, "SCHEDULED", nil); err != nil {
					a.log.Error("scheduled batch failed", "batch", batchKey, "error", err)
				}
			}
		}
	}()
}

func holidaySyncYears(now time.Time, before int, after int) []int {
	current := now.Year()
	years := []int{}
	for year := current - before; year <= current+after; year++ {
		years = append(years, year)
	}
	return years
}

func (a *app) syncHolidayYears(ctx context.Context, years []int) (holidaySyncResult, error) {
	result := holidaySyncResult{Years: years}
	if !a.cfg.holidaySyncEnabled {
		result.Skipped = true
		result.Message = "holiday sync disabled"
		return result, nil
	}
	if strings.TrimSpace(a.cfg.holidayServiceKey) == "" {
		result.Skipped = true
		result.Message = "APP_HOLIDAY_SYNC_SERVICE_KEY is empty"
		return result, nil
	}
	upserted := 0
	for _, year := range years {
		items, err := a.fetchHolidayYear(ctx, year)
		if err != nil {
			return result, err
		}
		for _, item := range items {
			if item.DateKey == "" || item.Name == "" {
				continue
			}
			_, err := a.db.Exec(ctx, `
				insert into holidays (date_key, name, source, is_holiday, synced_at, updated_at)
				values ($1, $2, 'data.go.kr', true, now(), now())
				on conflict (date_key) do update
				set name = excluded.name,
				    source = excluded.source,
				    is_holiday = excluded.is_holiday,
				    synced_at = now(),
				    updated_at = now()
			`, item.DateKey, item.Name)
			if err != nil {
				return result, err
			}
			upserted++
		}
	}
	result.Upserted = upserted
	return result, nil
}

func (a *app) fetchHolidayYear(ctx context.Context, year int) ([]holidayItem, error) {
	items := []holidayItem{}
	for month := 1; month <= 12; month++ {
		monthItems, err := a.fetchHolidayMonth(ctx, year, month)
		if err != nil {
			return nil, err
		}
		items = append(items, monthItems...)
	}
	return items, nil
}

func (a *app) fetchHolidayMonth(ctx context.Context, year int, month int) ([]holidayItem, error) {
	requestURL, err := holidayAPIURL(a.cfg.holidayAPIBaseURL, a.cfg.holidayServiceKey, year, month)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("holiday api returned HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	var parsed holidayAPIResponse
	if err := xml.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	if parsed.Header.ResultCode != "" && parsed.Header.ResultCode != "00" {
		return nil, fmt.Errorf("holiday api returned %s: %s", parsed.Header.ResultCode, parsed.Header.ResultMsg)
	}
	items := []holidayItem{}
	for _, raw := range parsed.Body.Items.Items {
		if !strings.EqualFold(strings.TrimSpace(raw.IsHoliday), "Y") {
			continue
		}
		dateKey := holidayLocDateKey(raw.LocDate)
		name := strings.TrimSpace(raw.DateName)
		if dateKey == "" || name == "" {
			continue
		}
		items = append(items, holidayItem{DateKey: dateKey, Name: name, Source: "data.go.kr"})
	}
	return items, nil
}

func holidayAPIURL(baseURL, serviceKey string, year int, month int) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", err
	}
	query := parsed.Query()
	query.Set("solYear", strconv.Itoa(year))
	query.Set("solMonth", fmt.Sprintf("%02d", month))
	query.Set("numOfRows", "100")
	parsed.RawQuery = query.Encode()
	separator := ""
	if parsed.RawQuery != "" {
		separator = "&"
	}
	key := strings.TrimSpace(serviceKey)
	if strings.Contains(key, "%") {
		parsed.RawQuery = parsed.RawQuery + separator + "serviceKey=" + key
	} else {
		parsed.RawQuery = parsed.RawQuery + separator + "serviceKey=" + url.QueryEscape(key)
	}
	return parsed.String(), nil
}

func holidayLocDateKey(value string) string {
	digits := strings.TrimSpace(value)
	if len(digits) != 8 {
		return ""
	}
	return digits[:4] + "-" + digits[4:6] + "-" + digits[6:8]
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
		if ip := strings.TrimSpace(parts[0]); net.ParseIP(ip) != nil {
			return ip
		}
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); net.ParseIP(realIP) != nil {
		return realIP
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func validPasswordLength(password string) bool {
	return len(password) >= 8 && len(password) <= maxPasswordBytes
}

func (a *app) allowRequest(key string, limit int, window time.Duration) bool {
	if limit <= 0 || window <= 0 {
		return true
	}
	now := time.Now()
	a.rateLimitMu.Lock()
	defer a.rateLimitMu.Unlock()
	if a.rateLimiters == nil {
		a.rateLimiters = make(map[string]rateLimitBucket)
	}
	if len(a.rateLimiters) > 10000 {
		for bucketKey, bucket := range a.rateLimiters {
			if now.After(bucket.resetAt) {
				delete(a.rateLimiters, bucketKey)
			}
		}
	}
	bucket := a.rateLimiters[key]
	if bucket.resetAt.IsZero() || now.After(bucket.resetAt) {
		a.rateLimiters[key] = rateLimitBucket{count: 1, resetAt: now.Add(window)}
		return true
	}
	if bucket.count >= limit {
		return false
	}
	bucket.count++
	a.rateLimiters[key] = bucket
	return true
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
	body := strings.Join([]string{
		fmt.Sprintf("%s님, Family Platform 회원가입을 완료하려면 이메일 인증이 필요합니다.", displayName),
		"",
		"아래 링크를 눌러 이메일 인증을 완료한 뒤 로그인하세요.",
		"",
		verifyURL,
		"",
		"이 링크는 24시간 동안 유효합니다.",
		"본인이 요청하지 않았다면 이 메일을 무시하세요.",
	}, "\n")
	message := strings.Join([]string{
		"From: " + from,
		"To: " + email,
		"Subject: " + mimeHeader(subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: base64",
		"",
		base64.StdEncoding.EncodeToString([]byte(body)),
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

func (a *app) sendAccountRecoveryReplyEmail(email string, inquiry accountRecoveryInquiryItem, replyMessage string) error {
	if !a.mailConfigured() {
		return fmt.Errorf("mail delivery is not configured")
	}
	from := a.mailFromEmail()
	subject := "Family Platform 계정 문의 답변"
	body := strings.Join([]string{
		"Family Platform 계정 문의에 대한 답변입니다.",
		"",
		"문의 유형: " + firstNonEmpty(inquiry.RecoveryType, "-"),
		"문의 이메일: " + firstNonEmpty(inquiry.Email, "-"),
		"문의 내용:",
		firstNonEmpty(inquiry.Message, "-"),
		"",
		"답변:",
		replyMessage,
		"",
		"추가 도움이 필요하면 관리자 문의로 다시 남겨주세요.",
	}, "\n")
	message := strings.Join([]string{
		"From: " + from,
		"To: " + email,
		"Subject: " + mimeHeader(subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: base64",
		"",
		base64.StdEncoding.EncodeToString([]byte(body)),
	}, "\r\n")
	return a.sendMail(from, []string{email}, subject, body, []byte(message))
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
	title := "인증 실패"
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
      sessionStorage.setItem('family-platform-access-token', token);
      sessionStorage.setItem('family-platform-user', JSON.stringify(user));
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

func queryFamilyID(r *http.Request) int64 {
	return queryInt64(r, "familyId", 0)
}

func (a *app) requestFamilyID(w http.ResponseWriter, r *http.Request, user authUser) (int64, bool) {
	familyID := queryFamilyID(r)
	if familyID > 0 {
		return familyID, true
	}

	resolvedID, err := a.defaultReadableFamilyID(r.Context(), user)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return 0, false
	}
	return resolvedID, true
}

func (a *app) defaultReadableFamilyID(ctx context.Context, user authUser) (int64, error) {
	var familyID int64
	err := a.db.QueryRow(ctx, `
		select f.id
		from family_groups f
		join family_members m on m.family_id = f.id
		where m.user_id = $1 and m.can_read = true
		order by m.joined_at asc, f.created_at asc
		limit 1
	`, user.ID).Scan(&familyID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return familyID, nil
}

func (a *app) familyDateRange(w http.ResponseWriter, r *http.Request, user authUser) (int64, string, string, bool) {
	familyID, ok := a.requestFamilyID(w, r, user)
	if !ok {
		return 0, "", "", false
	}
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
		&item.SharedMenuKeys,
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

func normalizeSharedMenuKeys(keys *[]string) []string {
	if keys == nil {
		return append([]string{}, shareableMenuKeys...)
	}
	seen := map[string]bool{}
	normalized := []string{}
	for _, key := range *keys {
		key = strings.TrimSpace(key)
		if shareableMenuKeySet[key] && !seen[key] {
			seen[key] = true
			normalized = append(normalized, key)
		}
	}
	return normalized
}

func menuPermissionColumn(permission string, prefix string) string {
	columns := map[string]string{
		"read":   "can_read",
		"create": "can_create",
		"update": "can_update",
		"delete": "can_delete",
	}
	column := columns[permission]
	if column == "" {
		return ""
	}
	if prefix == "" {
		return column
	}
	return prefix + "." + column
}

func (a *app) requireFamilyPermission(w http.ResponseWriter, ctx context.Context, user authUser, familyID int64, permission string) bool {
	if familyID <= 0 {
		return true
	}
	if a.hasFamilyPermission(ctx, user, familyID, permission) {
		return true
	}
	writeError(w, http.StatusForbidden, "permission denied")
	return false
}

func (a *app) hasFamilyPermission(ctx context.Context, user authUser, familyID int64, permission string) bool {
	column := map[string]string{
		"read":   "can_read",
		"create": "can_create",
		"update": "can_update",
		"delete": "can_delete",
	}[permission]
	if column == "" {
		return false
	}
	var allowed bool
	query := fmt.Sprintf("select exists(select 1 from family_members where family_id = $1 and user_id = $2 and %s = true)", column)
	if err := a.db.QueryRow(ctx, query, familyID, user.ID).Scan(&allowed); err != nil {
		return false
	}
	return allowed
}

func (a *app) hasFamilyPermissionForMenu(ctx context.Context, user authUser, familyID int64, permission string, menuKey string) bool {
	if menuKey == "" {
		return a.hasFamilyPermission(ctx, user, familyID, permission)
	}
	if !shareableMenuKeySet[menuKey] {
		return false
	}
	column := menuPermissionColumn(permission, "")
	if column == "" {
		return false
	}
	var allowed bool
	query := fmt.Sprintf(`
		select exists(
			select 1
			from family_members
			where family_id = $1
			  and user_id = $2
			  and %s = true
			  and $3 = any(shared_menu_keys)
		)
	`, column)
	if err := a.db.QueryRow(ctx, query, familyID, user.ID, menuKey).Scan(&allowed); err != nil {
		return false
	}
	return allowed
}

func (a *app) requireFamilyPermissionOrOwner(w http.ResponseWriter, ctx context.Context, user authUser, familyID int64, permission string, ownerID sql.NullInt64) bool {
	if ownerID.Valid && ownerID.Int64 == user.ID {
		return true
	}
	if a.hasFamilyPermission(ctx, user, familyID, permission) {
		return true
	}
	if ownerID.Valid && a.hasSharedFamilyPermission(ctx, user, ownerID.Int64, permission) {
		return true
	}
	writeError(w, http.StatusForbidden, "permission denied")
	return false
}

func (a *app) hasSharedFamilyPermission(ctx context.Context, user authUser, ownerID int64, permission string) bool {
	column := map[string]string{
		"read":   "viewer.can_read",
		"create": "viewer.can_create",
		"update": "viewer.can_update",
		"delete": "viewer.can_delete",
	}[permission]
	if column == "" {
		return false
	}
	var allowed bool
	query := fmt.Sprintf(`
		select exists(
			select 1
			from family_members viewer
			join family_members owner on owner.family_id = viewer.family_id
			where viewer.user_id = $1 and owner.user_id = $2 and %s = true
		)
	`, column)
	if err := a.db.QueryRow(ctx, query, user.ID, ownerID).Scan(&allowed); err != nil {
		return false
	}
	return allowed
}

func (a *app) requireFamilyPermissionOrOwnerForMenu(w http.ResponseWriter, ctx context.Context, user authUser, familyID int64, permission string, ownerID sql.NullInt64, menuKey string) bool {
	if ownerID.Valid && ownerID.Int64 == user.ID {
		return true
	}
	if ownerID.Valid && a.hasSharedFamilyPermissionForMenu(ctx, user, ownerID.Int64, permission, menuKey) {
		return true
	}
	writeError(w, http.StatusForbidden, "permission denied")
	return false
}

func (a *app) hasSharedFamilyPermissionForMenu(ctx context.Context, user authUser, ownerID int64, permission string, menuKey string) bool {
	if !shareableMenuKeySet[menuKey] {
		return false
	}
	column := menuPermissionColumn(permission, "viewer")
	if column == "" {
		return false
	}
	var allowed bool
	query := fmt.Sprintf(`
		select exists(
			select 1
			from family_members viewer
			join family_members owner on owner.family_id = viewer.family_id
			where viewer.user_id = $1
			  and owner.user_id = $2
			  and %s = true
			  and $3 = any(viewer.shared_menu_keys)
			  and $3 = any(owner.shared_menu_keys)
		)
	`, column)
	if err := a.db.QueryRow(ctx, query, user.ID, ownerID, menuKey).Scan(&allowed); err != nil {
		return false
	}
	return allowed
}

func (a *app) requireFamilyAdmin(w http.ResponseWriter, ctx context.Context, user authUser, familyID int64) bool {
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

func (a *app) resourceFamilyOwner(w http.ResponseWriter, ctx context.Context, query string, id int64) (int64, sql.NullInt64, bool) {
	var familyID int64
	var ownerID sql.NullInt64
	if err := a.db.QueryRow(ctx, query, id).Scan(&familyID, &ownerID); err != nil {
		writeError(w, http.StatusNotFound, "resource not found")
		return 0, ownerID, false
	}
	return familyID, ownerID, true
}

type ledgerPayload struct {
	Title             string  `json:"title"`
	EntryType         string  `json:"entryType"`
	Category          *string `json:"category"`
	PaymentMethod     *string `json:"paymentMethod"`
	MemberName        *string `json:"memberName"`
	Amount            float64 `json:"amount"`
	TransactionDate   string  `json:"transactionDate"`
	Memo              *string `json:"memo"`
	InstallmentMonths int     `json:"installmentMonths"`
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
	if req.InstallmentMonths == 0 {
		req.InstallmentMonths = 1
	}
	if req.InstallmentMonths < 1 || req.InstallmentMonths > 60 {
		writeError(w, http.StatusBadRequest, "installmentMonths must be between 1 and 60")
		return req, false
	}
	if req.InstallmentMonths > 1 && req.EntryType != "expense" {
		writeError(w, http.StatusBadRequest, "installments are only available for expenses")
		return req, false
	}
	if req.Amount <= 0 {
		writeError(w, http.StatusBadRequest, "amount must be greater than zero")
		return req, false
	}
	return req, true
}

func (a *app) saveLedgerEntry(w http.ResponseWriter, r *http.Request, entryID int64, familyID int64, req ledgerPayload, userID int64) (ledgerEntry, bool) {
	var item ledgerEntry
	var category, payment, member, memo sql.NullString
	var transactionDate, createdAt time.Time
	var err error
	if entryID == 0 {
		err = a.db.QueryRow(r.Context(), `
			insert into ledger_entries (family_id, title, entry_type, category, payment_method, member_name, amount, transaction_date, memo, created_at, updated_at, created_by_user_id)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now(), $10)
			returning id, family_id, title, entry_type, category, payment_method, member_name, coalesce(amount, 0), transaction_date, memo, created_at
		`, familyID, req.Title, req.EntryType, req.Category, req.PaymentMethod, req.MemberName, req.Amount, req.TransactionDate, req.Memo, userID).
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

func installmentTransactionDate(start time.Time, offset int) time.Time {
	year, month, day := start.Date()
	firstOfTargetMonth := time.Date(year, month+time.Month(offset), 1, 0, 0, 0, 0, start.Location())
	lastDay := firstOfTargetMonth.AddDate(0, 1, -1).Day()
	if day > lastDay {
		day = lastDay
	}
	return time.Date(firstOfTargetMonth.Year(), firstOfTargetMonth.Month(), day, 0, 0, 0, 0, start.Location())
}

func installmentAmounts(total int64, months int) []int64 {
	amounts := make([]int64, months)
	baseAmount := total / int64(months)
	remainder := total % int64(months)
	for index := range amounts {
		amounts[index] = baseAmount
		if int64(index) < remainder {
			amounts[index]++
		}
	}
	return amounts
}

func (a *app) saveLedgerInstallments(w http.ResponseWriter, r *http.Request, familyID int64, req ledgerPayload, userID int64) ([]ledgerEntry, bool) {
	startDate, err := time.Parse("2006-01-02", req.TransactionDate)
	if err != nil {
		writeError(w, http.StatusBadRequest, "transactionDate is invalid")
		return nil, false
	}
	totalAmount := int64(math.Round(req.Amount))
	if totalAmount <= 0 {
		writeError(w, http.StatusBadRequest, "amount must be greater than zero")
		return nil, false
	}
	amounts := installmentAmounts(totalAmount, req.InstallmentMonths)
	groupKey := newSessionID()
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return nil, false
	}
	defer tx.Rollback(r.Context())
	items := make([]ledgerEntry, 0, req.InstallmentMonths)
	for index := 0; index < req.InstallmentMonths; index++ {
		amount := amounts[index]
		var item ledgerEntry
		var category, payment, member, memo sql.NullString
		var transactionDate, createdAt time.Time
		err = tx.QueryRow(r.Context(), `
			insert into ledger_entries (family_id, title, entry_type, category, payment_method, member_name, amount, transaction_date, memo, installment_group_key, installment_sequence, installment_months, created_at, updated_at, created_by_user_id)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now(), $13)
			returning id, family_id, title, entry_type, category, payment_method, member_name, coalesce(amount, 0), transaction_date, memo, created_at
		`, familyID, req.Title, req.EntryType, req.Category, req.PaymentMethod, req.MemberName, amount, formatDate(installmentTransactionDate(startDate, index)), req.Memo, groupKey, index+1, req.InstallmentMonths, userID).
			Scan(&item.ID, &item.FamilyID, &item.Title, &item.EntryType, &category, &payment, &member, &item.Amount, &transactionDate, &memo, &createdAt)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "installment save failed")
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
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return nil, false
	}
	return items, true
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
	PushEnabled   *bool   `json:"pushEnabled"`
}

type scheduleExceptionPayload struct {
	OccurrenceDate string `json:"occurrenceDate"`
}

func readSchedulePayload(w http.ResponseWriter, r *http.Request) (schedulePayload, bool) {
	var req schedulePayload
	if !readJSON(w, r, &req) {
		return req, false
	}
	req.Title = strings.TrimSpace(req.Title)
	req.CalendarBasis = emptyDefault(req.CalendarBasis, "solar")
	if req.PushEnabled == nil {
		enabled := true
		req.PushEnabled = &enabled
	}
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

func readScheduleExceptionPayload(w http.ResponseWriter, r *http.Request) (scheduleExceptionPayload, bool) {
	var req scheduleExceptionPayload
	if !readJSON(w, r, &req) {
		return req, false
	}
	req.OccurrenceDate = strings.TrimSpace(req.OccurrenceDate)
	if !validDate(req.OccurrenceDate) {
		writeError(w, http.StatusBadRequest, "occurrenceDate is required")
		return req, false
	}
	return req, true
}

func (a *app) saveSchedule(w http.ResponseWriter, r *http.Request, id int64, familyID int64, req schedulePayload, userID int64) (scheduleItem, bool) {
	var item scheduleItem
	var scheduleDate, createdAt time.Time
	var scheduleTime, category, member, repeat, memo sql.NullString
	var err error
	if id == 0 {
		err = a.db.QueryRow(r.Context(), `
			insert into family_schedules (family_id, title, calendar_basis, schedule_date, schedule_time, category, member_name, repeat_rule, memo, push_enabled, created_at, updated_at, created_by_user_id)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now(),$11)
			returning id, coalesce(family_id, 0), title, calendar_basis, schedule_date, schedule_time::text, category, member_name, repeat_rule, memo, push_enabled, created_at
		`, familyID, req.Title, req.CalendarBasis, req.ScheduleDate, req.ScheduleTime, req.Category, req.MemberName, req.RepeatRule, req.Memo, *req.PushEnabled, userID).
			Scan(&item.ID, &item.FamilyID, &item.Title, &item.CalendarBasis, &scheduleDate, &scheduleTime, &category, &member, &repeat, &memo, &item.PushEnabled, &createdAt)
	} else {
		err = a.db.QueryRow(r.Context(), `
			update family_schedules set title=$1, calendar_basis=$2, schedule_date=$3, schedule_time=$4, category=$5, member_name=$6, repeat_rule=$7, memo=$8, push_enabled=$9, updated_at=now()
			where id=$10 and coalesce(family_id, 0)=$11 and deleted_at is null
			returning id, coalesce(family_id, 0), title, calendar_basis, schedule_date, schedule_time::text, category, member_name, repeat_rule, memo, push_enabled, created_at
		`, req.Title, req.CalendarBasis, req.ScheduleDate, req.ScheduleTime, req.Category, req.MemberName, req.RepeatRule, req.Memo, *req.PushEnabled, id, familyID).
			Scan(&item.ID, &item.FamilyID, &item.Title, &item.CalendarBasis, &scheduleDate, &scheduleTime, &category, &member, &repeat, &memo, &item.PushEnabled, &createdAt)
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
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.Title, &item.CalendarBasis, &scheduleDate, &scheduleTime, &category, &member, &repeat, &memo, &item.PushEnabled, &createdAt, &item.ExceptionDates); err != nil {
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

func (a *app) saveTrip(w http.ResponseWriter, r *http.Request, id int64, familyID int64, req tripPayload, userID int64) (tripItem, bool) {
	var item tripItem
	var startDate, endDate, createdAt time.Time
	var description sql.NullString
	var err error
	if id == 0 {
		err = a.db.QueryRow(r.Context(), `
			insert into trips (family_id, title, start_date, end_date, description, created_at, updated_at, created_by_user_id)
			values ($1,$2,$3,$4,$5,now(),now(),$6)
			returning id, family_id, title, start_date, end_date, description, created_at
		`, familyID, req.Title, req.StartDate, req.EndDate, req.Description, userID).
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
	if req.Title == "" || !validDate(req.RecordDate) {
		writeError(w, http.StatusBadRequest, "title and recordDate are required")
		return req, false
	}
	if req.RecordTime != nil && !validTimeText(strings.TrimSpace(*req.RecordTime)) {
		writeError(w, http.StatusBadRequest, "recordTime is invalid")
		return req, false
	}
	return req, true
}

func (a *app) saveTravelRecord(w http.ResponseWriter, r *http.Request, id int64, tripID int64, req travelRecordPayload, userID int64) (travelRecordItem, bool) {
	previousMediaURLs := []string{}
	if id != 0 {
		previousMediaURLs = a.mediaURLs(r.Context(), "travel_record_media_urls", "travel_record_id", id)
	}
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
			insert into travel_records (trip_id, sort_order, title, category, amount, note, location, latitude, longitude, record_date, record_time, created_at, updated_at, created_by_user_id)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now(),$12)
			returning id, trip_id, sort_order, title, category, coalesce(amount, 0), note, location, latitude, longitude, record_date, record_time::text, created_at
		`, tripID, req.SortOrder, req.Title, req.Category, req.Amount, req.Note, req.Location, req.Latitude, req.Longitude, req.RecordDate, req.RecordTime, userID).
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
	a.deleteUnusedMediaURLs(r.Context(), mediaURLsRemoved(previousMediaURLs, req.MediaURLs))
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
	return a.mediaURLsByQuery(ctx, query, id)
}

func (a *app) mediaURLsByQuery(ctx context.Context, query string, args ...any) []string {
	rows, err := a.db.Query(ctx, query, args...)
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

func mediaURLsRemoved(previous, next []string) []string {
	retained := map[string]bool{}
	for _, mediaURL := range next {
		if value := strings.TrimSpace(mediaURL); value != "" {
			retained[value] = true
		}
	}
	removed := []string{}
	seen := map[string]bool{}
	for _, mediaURL := range previous {
		mediaURL = strings.TrimSpace(mediaURL)
		if mediaURL != "" && !retained[mediaURL] && !seen[mediaURL] {
			removed = append(removed, mediaURL)
			seen[mediaURL] = true
		}
	}
	return removed
}

func (a *app) deleteUnusedMediaURLs(ctx context.Context, mediaURLs []string) {
	for _, mediaURL := range mediaURLsRemoved(mediaURLs, nil) {
		a.deleteMediaIfUnused(ctx, mediaURL)
	}
}

// deleteMediaIfUnused only removes files owned by this application's media prefix.
// A file may be attached to several records, so every active media relation is checked first.
func (a *app) deleteMediaIfUnused(ctx context.Context, mediaURL string) {
	mediaURL = strings.TrimSpace(mediaURL)
	if mediaURL == "" {
		return
	}
	var stillUsed bool
	err := a.db.QueryRow(ctx, `
		select exists(
			select 1 from baby_profiles where deleted_at is null and photo_url = $1
			union all
			select 1 from travel_record_media_urls m join travel_records r on r.id = m.travel_record_id and r.deleted_at is null join trips t on t.id = r.trip_id and t.deleted_at is null where m.media_urls = $1
			union all
			select 1 from restaurant_media_urls m join restaurants r on r.id = m.restaurant_id and r.deleted_at is null where m.media_urls = $1
			union all
			select 1 from baby_record_media_urls m join baby_records r on r.id = m.baby_record_id and r.deleted_at is null join baby_profiles b on b.id = r.baby_id and b.deleted_at is null where m.media_urls = $1
			union all
			select 1 from family_diary_media_urls m join family_diaries d on d.id = m.family_diary_id and d.deleted_at is null where m.media_urls = $1
			union all
			select 1 from community_post_media_urls m join community_posts p on p.id = m.community_post_id and p.deleted_at is null where m.media_urls = $1
		)
	`, mediaURL).Scan(&stillUsed)
	if err != nil || stillUsed {
		if err != nil {
			a.log.Warn("media reference check failed", "error", err)
		}
		return
	}
	parsedURL, err := url.Parse(mediaURL)
	if err != nil {
		return
	}
	mediaPrefix := strings.TrimRight(a.cfg.mediaPublicPrefix, "/") + "/"
	if !strings.HasPrefix(parsedURL.Path, mediaPrefix) {
		return
	}
	fileName := filepath.Base(strings.TrimPrefix(parsedURL.Path, mediaPrefix))
	if fileName == "." || fileName == string(filepath.Separator) || fileName == "" {
		return
	}
	if err := a.mediaStore.Delete(ctx, fileName); err != nil {
		a.log.Warn("media delete failed", "error", err, "file", fileName)
		return
	}
	_ = a.mediaStore.Delete(ctx, mediaThumbnailName(fileName))
	_ = a.mediaStore.Delete(ctx, legacyMediaThumbnailName(fileName))
	_ = a.mediaStore.Delete(ctx, mediaDisplayName(fileName))
	if _, err := a.db.Exec(ctx, "update media_files set deleted_at = now() where storage_key = $1 and deleted_at is null", fileName); err != nil {
		a.log.Warn("media usage cleanup failed", "error", err, "file", fileName)
	}
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

func readRestaurantPayload(w http.ResponseWriter, r *http.Request) (restaurantPayload, bool) {
	var req restaurantPayload
	if !readJSON(w, r, &req) {
		return req, false
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || !validDate(req.VisitDate) {
		writeError(w, http.StatusBadRequest, "name and visitDate are required")
		return req, false
	}
	return req, true
}

func (a *app) saveRestaurant(w http.ResponseWriter, r *http.Request, id int64, familyID int64, req restaurantPayload, userID int64) (restaurantItem, bool) {
	mediaURLs, ok := a.validateMediaReferencesForMenu(w, "restaurant", req.MediaURLs)
	if !ok {
		return restaurantItem{}, false
	}
	previousMediaURLs := []string{}
	if id != 0 {
		previousMediaURLs = a.mediaURLs(r.Context(), "restaurant_media_urls", "restaurant_id", id)
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return restaurantItem{}, false
	}
	defer tx.Rollback(r.Context())

	var item restaurantItem
	var menu, location, address, memo sql.NullString
	var price, rating, latitude, longitude sql.NullFloat64
	var visitDate, createdAt time.Time
	if id == 0 {
		err = tx.QueryRow(r.Context(), `
			insert into restaurants (family_id, name, menu, price, rating, visit_date, location, address, latitude, longitude, memo, created_at, updated_at, created_by_user_id)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now(),$12)
			returning id, family_id, name, menu, price, rating, visit_date, location, address, latitude, longitude, memo, created_at
		`, familyID, req.Name, req.Menu, req.Price, req.Rating, req.VisitDate, req.Location, req.Address, req.Latitude, req.Longitude, req.Memo, userID).
			Scan(&item.ID, &item.FamilyID, &item.Name, &menu, &price, &rating, &visitDate, &location, &address, &latitude, &longitude, &memo, &createdAt)
	} else {
		err = tx.QueryRow(r.Context(), `
			update restaurants set name=$1, menu=$2, price=$3, rating=$4, visit_date=$5, location=$6, address=$7, latitude=$8, longitude=$9, memo=$10, updated_at=now()
			where id=$11 and family_id=$12 and deleted_at is null
			returning id, family_id, name, menu, price, rating, visit_date, location, address, latitude, longitude, memo, created_at
		`, req.Name, req.Menu, req.Price, req.Rating, req.VisitDate, req.Location, req.Address, req.Latitude, req.Longitude, req.Memo, id, familyID).
			Scan(&item.ID, &item.FamilyID, &item.Name, &menu, &price, &rating, &visitDate, &location, &address, &latitude, &longitude, &memo, &createdAt)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "restaurant save failed")
		return item, false
	}
	_, _ = tx.Exec(r.Context(), "delete from restaurant_media_urls where restaurant_id = $1", item.ID)
	for _, mediaURL := range mediaURLs {
		if _, err := tx.Exec(r.Context(), "insert into restaurant_media_urls (restaurant_id, media_urls) values ($1,$2)", item.ID, mediaURL); err != nil {
			writeError(w, http.StatusInternalServerError, "media save failed")
			return item, false
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return item, false
	}
	a.deleteUnusedMediaURLs(r.Context(), mediaURLsRemoved(previousMediaURLs, mediaURLs))
	item.Menu = nullString(menu)
	item.Price = nullFloat(price)
	item.Rating = nullFloat(rating)
	item.VisitDate = formatDate(visitDate)
	item.Location = nullString(location)
	item.Address = nullString(address)
	item.Latitude = nullFloat(latitude)
	item.Longitude = nullFloat(longitude)
	item.Memo = nullString(memo)
	item.MediaURLs = mediaURLs
	item.CreatedAt = formatTime(createdAt)
	return item, true
}

func (a *app) scanRestaurants(w http.ResponseWriter, ctx context.Context, rows pgx.Rows) ([]restaurantItem, bool) {
	items := []restaurantItem{}
	for rows.Next() {
		var item restaurantItem
		var menu, location, address, memo sql.NullString
		var price, rating, latitude, longitude sql.NullFloat64
		var visitDate, createdAt time.Time
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.Name, &menu, &price, &rating, &visitDate, &location, &address, &latitude, &longitude, &memo, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.Menu = nullString(menu)
		item.Price = nullFloat(price)
		item.Rating = nullFloat(rating)
		item.VisitDate = formatDate(visitDate)
		item.Location = nullString(location)
		item.Address = nullString(address)
		item.Latitude = nullFloat(latitude)
		item.Longitude = nullFloat(longitude)
		item.Memo = nullString(memo)
		item.MediaURLs = a.mediaURLs(ctx, "restaurant_media_urls", "restaurant_id", item.ID)
		item.CreatedAt = formatTime(createdAt)
		items = append(items, item)
	}
	return items, true
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

func parseMenuMediaMaxFiles(value string) map[string]int {
	limits := map[string]int{}
	for _, item := range strings.Split(value, ",") {
		key, rawLimit, ok := strings.Cut(strings.TrimSpace(item), "=")
		if !ok || strings.TrimSpace(key) == "" {
			continue
		}
		limit, err := strconv.Atoi(strings.TrimSpace(rawLimit))
		if err == nil && limit > 0 {
			limits[strings.TrimSpace(key)] = limit
		}
	}
	return limits
}

func (a *app) validateMediaReferencesForMenu(w http.ResponseWriter, menuKey string, mediaURLs []string) ([]string, bool) {
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
	// 메뉴별 등록 개수 제한은 준비만 해 두고 현재는 비활성 상태입니다.
	// 운영 적용 시 APP_MEDIA_MENU_LIMITS_ENABLED=true로 변경하면 아래 정책이 적용됩니다.
	if a.cfg.mediaMenuLimitsEnabled {
		if limit := a.cfg.mediaMenuMaxFiles[menuKey]; limit > 0 && len(out) > limit {
			writeError(w, http.StatusRequestEntityTooLarge, "too many media files for menu")
			return nil, false
		}
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
	if req.Gender != nil {
		gender := strings.TrimSpace(*req.Gender)
		req.Gender = &gender
	}
	if req.PhotoURL != nil {
		photoURL := strings.TrimSpace(*req.PhotoURL)
		if photoURL == "" {
			req.PhotoURL = nil
		} else {
			req.PhotoURL = &photoURL
		}
	}
	if req.Name == "" || req.Gender == nil || *req.Gender == "" || !validDate(req.BirthDate) {
		writeError(w, http.StatusBadRequest, "name, gender and birthDate are required")
		return req, false
	}
	return req, true
}

func (a *app) saveBaby(w http.ResponseWriter, r *http.Request, id int64, familyID int64, req babyPayload, userID int64) (babyProfileItem, bool) {
	var item babyProfileItem
	var gender, memo, photo sql.NullString
	var previousPhoto sql.NullString
	var initialHeight, initialWeight sql.NullFloat64
	var birthDate, createdAt time.Time
	var err error
	if id != 0 {
		if err := a.db.QueryRow(r.Context(), "select photo_url from baby_profiles where id = $1 and family_id = $2 and deleted_at is null", id, familyID).Scan(&previousPhoto); err != nil {
			writeError(w, http.StatusInternalServerError, "database read failed")
			return item, false
		}
	}
	if id == 0 {
		err = a.db.QueryRow(r.Context(), `
			insert into baby_profiles (family_id, name, gender, birth_date, memo, photo_url, initial_height_cm, initial_weight_kg, created_at, updated_at, created_by_user_id)
			values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now(),$9)
			returning id, family_id, name, gender, birth_date, memo, photo_url, initial_height_cm, initial_weight_kg, created_at
		`, familyID, req.Name, req.Gender, req.BirthDate, req.Memo, req.PhotoURL, req.LatestHeightCm, req.LatestWeightKg, userID).
			Scan(&item.ID, &item.FamilyID, &item.Name, &gender, &birthDate, &memo, &photo, &initialHeight, &initialWeight, &createdAt)
	} else {
		err = a.db.QueryRow(r.Context(), `
			update baby_profiles set name=$1, gender=$2, birth_date=$3, memo=$4, photo_url=$5, initial_height_cm=$6, initial_weight_kg=$7, updated_at=now()
			where id=$8 and family_id=$9 and deleted_at is null
			returning id, family_id, name, gender, birth_date, memo, photo_url, initial_height_cm, initial_weight_kg, created_at
		`, req.Name, req.Gender, req.BirthDate, req.Memo, req.PhotoURL, req.LatestHeightCm, req.LatestWeightKg, id, familyID).
			Scan(&item.ID, &item.FamilyID, &item.Name, &gender, &birthDate, &memo, &photo, &initialHeight, &initialWeight, &createdAt)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "baby save failed")
		return item, false
	}
	item.Gender = nullString(gender)
	item.BirthDate = formatDate(birthDate)
	item.Memo = nullString(memo)
	item.PhotoURL = nullString(photo)
	item.InitialHeightCm = nullFloat(initialHeight)
	item.InitialWeightKg = nullFloat(initialWeight)
	a.fillBabyLatestGrowth(r.Context(), &item)
	item.CreatedAt = formatTime(createdAt)
	nextPhotoURL := ""
	if req.PhotoURL != nil {
		nextPhotoURL = strings.TrimSpace(*req.PhotoURL)
	}
	if previousPhoto.Valid && previousPhoto.String != nextPhotoURL {
		a.deleteBabyPhotoIfUnused(r.Context(), previousPhoto.String, item.ID)
	}
	return item, true
}

func (a *app) fillBabyLatestGrowth(ctx context.Context, item *babyProfileItem) {
	var height, weight sql.NullFloat64
	err := a.db.QueryRow(ctx, `
		select
		  coalesce((select r.height_cm from baby_records r where r.baby_id = b.id and r.deleted_at is null and r.height_cm is not null order by r.record_date desc, r.created_at desc limit 1), b.initial_height_cm),
		  coalesce((select r.weight_kg from baby_records r where r.baby_id = b.id and r.deleted_at is null and r.weight_kg is not null order by r.record_date desc, r.created_at desc limit 1), b.initial_weight_kg)
		from baby_profiles b where b.id = $1
	`, item.ID).Scan(&height, &weight)
	if err == nil {
		item.LatestHeightCm = nullFloat(height)
		item.LatestWeightKg = nullFloat(weight)
	}
}

func scanBabies(w http.ResponseWriter, rows pgx.Rows) ([]babyProfileItem, bool) {
	items := []babyProfileItem{}
	for rows.Next() {
		var item babyProfileItem
		var gender, memo, photo sql.NullString
		var initialHeight, initialWeight, latestHeight, latestWeight sql.NullFloat64
		var birthDate, createdAt time.Time
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.Name, &gender, &birthDate, &memo, &photo, &initialHeight, &initialWeight, &latestHeight, &latestWeight, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.Gender = nullString(gender)
		item.BirthDate = formatDate(birthDate)
		item.Memo = nullString(memo)
		item.PhotoURL = nullString(photo)
		item.InitialHeightCm = nullFloat(initialHeight)
		item.InitialWeightKg = nullFloat(initialWeight)
		item.LatestHeightCm = nullFloat(latestHeight)
		item.LatestWeightKg = nullFloat(latestWeight)
		item.CreatedAt = formatTime(createdAt)
		items = append(items, item)
	}
	return items, true
}

type babyRecordPayload struct {
	RecordType   string   `json:"recordType"`
	RecordDate   string   `json:"recordDate"`
	RecordTime   *string  `json:"recordTime"`
	SleepEndTime *string  `json:"sleepEndTime"`
	AmountMl     *int     `json:"amountMl"`
	HeightCm     *float64 `json:"heightCm"`
	WeightKg     *float64 `json:"weightKg"`
	Memo         *string  `json:"memo"`
	MediaURLs    []string `json:"mediaUrls"`
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
	if req.RecordTime != nil && !validTimeText(strings.TrimSpace(*req.RecordTime)) {
		writeError(w, http.StatusBadRequest, "recordTime is invalid")
		return req, false
	}
	if req.SleepEndTime != nil && !validTimeText(strings.TrimSpace(*req.SleepEndTime)) {
		writeError(w, http.StatusBadRequest, "sleepEndTime is invalid")
		return req, false
	}
	if req.RecordType == "수면" && (req.RecordTime == nil || strings.TrimSpace(*req.RecordTime) == "" || req.SleepEndTime == nil || strings.TrimSpace(*req.SleepEndTime) == "") {
		writeError(w, http.StatusBadRequest, "sleep start and end times are required")
		return req, false
	}
	return req, true
}

func (a *app) saveBabyRecord(w http.ResponseWriter, r *http.Request, id int64, babyID int64, req babyRecordPayload, userID int64) (babyRecordItem, bool) {
	mediaURLs, ok := a.validateMediaReferencesForMenu(w, "baby", req.MediaURLs)
	if !ok {
		return babyRecordItem{}, false
	}
	previousMediaURLs := []string{}
	if id != 0 {
		previousMediaURLs = a.mediaURLs(r.Context(), "baby_record_media_urls", "baby_record_id", id)
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return babyRecordItem{}, false
	}
	defer tx.Rollback(r.Context())
	var item babyRecordItem
	var recordTime, sleepEndTime, memo sql.NullString
	var amount sql.NullInt32
	var height, weight sql.NullFloat64
	var recordDate, createdAt time.Time
	if id == 0 {
		err = tx.QueryRow(r.Context(), `
			insert into baby_records (baby_id, record_type, record_date, record_time, sleep_end_time, amount_ml, height_cm, weight_kg, memo, created_at, updated_at, created_by_user_id)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now(),$10)
			returning id, baby_id, record_type, record_date, record_time, sleep_end_time, amount_ml, height_cm, weight_kg, memo, created_at
		`, babyID, req.RecordType, req.RecordDate, req.RecordTime, req.SleepEndTime, req.AmountMl, req.HeightCm, req.WeightKg, req.Memo, userID).
			Scan(&item.ID, &item.BabyID, &item.RecordType, &recordDate, &recordTime, &sleepEndTime, &amount, &height, &weight, &memo, &createdAt)
	} else {
		err = tx.QueryRow(r.Context(), `
			update baby_records set record_type=$1, record_date=$2, record_time=$3, sleep_end_time=$4, amount_ml=$5, height_cm=$6, weight_kg=$7, memo=$8, updated_at=now()
			where id=$9 and baby_id=$10 and deleted_at is null
			returning id, baby_id, record_type, record_date, record_time, sleep_end_time, amount_ml, height_cm, weight_kg, memo, created_at
		`, req.RecordType, req.RecordDate, req.RecordTime, req.SleepEndTime, req.AmountMl, req.HeightCm, req.WeightKg, req.Memo, id, babyID).
			Scan(&item.ID, &item.BabyID, &item.RecordType, &recordDate, &recordTime, &sleepEndTime, &amount, &height, &weight, &memo, &createdAt)
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
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "database commit failed")
		return item, false
	}
	a.deleteUnusedMediaURLs(r.Context(), mediaURLsRemoved(previousMediaURLs, mediaURLs))
	item.RecordDate = formatDate(recordDate)
	item.RecordTime = nullString(recordTime)
	item.SleepEndTime = nullString(sleepEndTime)
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
		var recordTime, sleepEndTime, memo sql.NullString
		var amount sql.NullInt32
		var height, weight sql.NullFloat64
		var recordDate, createdAt time.Time
		if err := rows.Scan(&item.ID, &item.BabyID, &item.RecordType, &recordDate, &recordTime, &sleepEndTime, &amount, &height, &weight, &memo, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.RecordDate = formatDate(recordDate)
		item.RecordTime = nullString(recordTime)
		item.SleepEndTime = nullString(sleepEndTime)
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
	DiaryTime      *string  `json:"diaryTime"`
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
	if req.DiaryTime != nil && !validTimeText(strings.TrimSpace(*req.DiaryTime)) {
		writeError(w, http.StatusBadRequest, "diaryTime is invalid")
		return req, false
	}
	return req, true
}

func (a *app) saveDiary(w http.ResponseWriter, r *http.Request, id int64, familyID int64, req diaryPayload, userID int64) (diaryItem, bool) {
	mediaURLs, ok := a.validateMediaReferencesForMenu(w, "diary", req.MediaURLs)
	if !ok {
		return diaryItem{}, false
	}
	previousMediaURLs := []string{}
	if id != 0 {
		previousMediaURLs = a.mediaURLs(r.Context(), "family_diary_media_urls", "family_diary_id", id)
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return diaryItem{}, false
	}
	defer tx.Rollback(r.Context())
	var item diaryItem
	var diaryTime, weather, mood sql.NullString
	var minTemp, maxTemp sql.NullInt32
	var diaryDate, createdAt time.Time
	if id == 0 {
		err = tx.QueryRow(r.Context(), `
			insert into family_diaries (family_id, title, body, diary_date, diary_time, weather, mood, min_temperature, max_temperature, created_at, updated_at, created_by_user_id)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now(),$10)
			returning id, family_id, title, body::text, diary_date, diary_time::text, weather, mood, min_temperature, max_temperature, created_at
		`, familyID, req.Title, req.Body, req.DiaryDate, req.DiaryTime, req.Weather, req.Mood, req.MinTemperature, req.MaxTemperature, userID).
			Scan(&item.ID, &item.FamilyID, &item.Title, &item.Body, &diaryDate, &diaryTime, &weather, &mood, &minTemp, &maxTemp, &createdAt)
	} else {
		err = tx.QueryRow(r.Context(), `
			update family_diaries set title=$1, body=$2, diary_date=$3, diary_time=$4, weather=$5, mood=$6, min_temperature=$7, max_temperature=$8, updated_at=now()
			where id=$9 and family_id=$10 and deleted_at is null
			returning id, family_id, title, body::text, diary_date, diary_time::text, weather, mood, min_temperature, max_temperature, created_at
		`, req.Title, req.Body, req.DiaryDate, req.DiaryTime, req.Weather, req.Mood, req.MinTemperature, req.MaxTemperature, id, familyID).
			Scan(&item.ID, &item.FamilyID, &item.Title, &item.Body, &diaryDate, &diaryTime, &weather, &mood, &minTemp, &maxTemp, &createdAt)
	}
	if err != nil {
		a.log.Error("diary save failed", "error", err, "diaryID", id, "familyID", familyID, "userID", userID)
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
	a.deleteUnusedMediaURLs(r.Context(), mediaURLsRemoved(previousMediaURLs, mediaURLs))
	item.DiaryDate = formatDate(diaryDate)
	item.DiaryTime = nullString(diaryTime)
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
		var diaryTime, weather, mood sql.NullString
		var minTemp, maxTemp sql.NullInt32
		var diaryDate, createdAt time.Time
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.Title, &item.Body, &diaryDate, &diaryTime, &weather, &mood, &minTemp, &maxTemp, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.DiaryDate = formatDate(diaryDate)
		item.DiaryTime = nullString(diaryTime)
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
	BoardType       string   `json:"boardType"`
	FamilyID        *int64   `json:"familyId"`
	Title           string   `json:"title"`
	Body            string   `json:"body"`
	MediaURLs       []string `json:"mediaUrls"`
	IsPrivate       bool     `json:"isPrivate"`
	CommentsEnabled *bool    `json:"commentsEnabled"`
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
	if utf8.RuneCountInString(req.Title) > maxCommunityPostTitleRunes {
		writeError(w, http.StatusBadRequest, "title is too long")
		return req, false
	}
	if utf8.RuneCountInString(req.Body) > maxCommunityPostBodyRunes {
		writeError(w, http.StatusBadRequest, "body is too long")
		return req, false
	}
	if req.BoardType == "notice" || req.BoardType == "free" {
		req.FamilyID = nil
	}
	if req.BoardType != "inquiry" {
		req.IsPrivate = false
	}
	return req, true
}

func (a *app) requireBoardRead(w http.ResponseWriter, user authUser, board string) bool {
	return true
}

func (a *app) requireBoardWrite(w http.ResponseWriter, user authUser, board string) bool {
	if board == "notice" && !user.PlatformAdmin {
		writeError(w, http.StatusForbidden, "platform admin permission required")
		return false
	}
	return true
}

func canReadCommunityPost(user authUser, post communityPostItem) bool {
	return post.BoardType != "inquiry" || !post.IsPrivate || user.PlatformAdmin
}

func (a *app) requirePostRead(w http.ResponseWriter, ctx context.Context, user authUser, post communityPostItem) bool {
	if !canReadCommunityPost(user, post) {
		writeError(w, http.StatusForbidden, "private inquiry is restricted to platform administrators")
		return false
	}
	if post.FamilyID != nil {
		var ownerID sql.NullInt64
		if post.AuthorID != nil {
			ownerID = sql.NullInt64{Int64: *post.AuthorID, Valid: true}
		}
		return a.requireFamilyPermissionOrOwnerForMenu(w, ctx, user, *post.FamilyID, "read", ownerID, "community")
	}
	return true
}

func (a *app) requirePostWrite(w http.ResponseWriter, user authUser, post communityPostItem) bool {
	if user.PlatformAdmin {
		return true
	}
	if post.BoardType == "notice" || post.AuthorID == nil || *post.AuthorID != user.ID {
		writeError(w, http.StatusForbidden, "only the author can change this content")
		return false
	}
	return true
}

func (a *app) saveCommunityPost(w http.ResponseWriter, r *http.Request, id int64, user authUser, req communityPostPayload) (communityPostItem, bool) {
	mediaURLs, ok := a.validateMediaReferencesForMenu(w, "community", req.MediaURLs)
	if !ok {
		return communityPostItem{}, false
	}
	previousMediaURLs := []string{}
	if id != 0 {
		previousMediaURLs = a.mediaURLs(r.Context(), "community_post_media_urls", "community_post_id", id)
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database transaction failed")
		return communityPostItem{}, false
	}
	defer tx.Rollback(r.Context())
	if id == 0 && req.BoardType == "free" {
		// Serialize this user's free-board posts so parallel requests cannot bypass the cooldown.
		if _, err := tx.Exec(r.Context(), "select pg_advisory_xact_lock($1)", user.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "free board rate limit lock failed")
			return communityPostItem{}, false
		}
		var blocked bool
		err := tx.QueryRow(r.Context(), `
			select exists(
				select 1 from community_posts
				where board_type = 'free' and author_id = $1 and deleted_at is null
				  and created_at > now() - $2::interval
			)
		`, user.ID, fmt.Sprintf("%d seconds", int(freeCommunityPostCooldown/time.Second))).Scan(&blocked)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "free board rate limit check failed")
			return communityPostItem{}, false
		}
		if blocked {
			writeError(w, http.StatusTooManyRequests, "free board post rate limit: one post per 10 minutes")
			return communityPostItem{}, false
		}
	}
	commentsEnabled := true
	if (req.BoardType == "notice" || req.BoardType == "free") && req.CommentsEnabled != nil {
		commentsEnabled = *req.CommentsEnabled
	}
	var item communityPostItem
	var familyID, authorID sql.NullInt64
	var isPrivate, savedCommentsEnabled bool
	var createdAt, updatedAt time.Time
	if id == 0 {
		err = tx.QueryRow(r.Context(), `
			insert into community_posts (board_type, family_id, author_id, author_name, title, body, is_private, comments_enabled, created_at, updated_at)
			values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())
			returning id, board_type, family_id, author_id, author_name, title, body::text, coalesce(view_count,0), coalesce(is_private,false), coalesce(comments_enabled,true), created_at, updated_at
		`, req.BoardType, req.FamilyID, user.ID, a.displayName(r.Context(), user), req.Title, req.Body, req.IsPrivate, commentsEnabled).
			Scan(&item.ID, &item.BoardType, &familyID, &authorID, &item.AuthorName, &item.Title, &item.Body, &item.ViewCount, &isPrivate, &savedCommentsEnabled, &createdAt, &updatedAt)
	} else {
		err = tx.QueryRow(r.Context(), `
			update community_posts set board_type=$1, family_id=$2, title=$3, body=$4, is_private=$5, comments_enabled=$6, updated_at=now()
			where id=$7 and deleted_at is null
			returning id, board_type, family_id, author_id, author_name, title, body::text, coalesce(view_count,0), coalesce(is_private,false), coalesce(comments_enabled,true), created_at, updated_at
		`, req.BoardType, req.FamilyID, req.Title, req.Body, req.IsPrivate, commentsEnabled, id).
			Scan(&item.ID, &item.BoardType, &familyID, &authorID, &item.AuthorName, &item.Title, &item.Body, &item.ViewCount, &isPrivate, &savedCommentsEnabled, &createdAt, &updatedAt)
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
	a.deleteUnusedMediaURLs(r.Context(), mediaURLsRemoved(previousMediaURLs, mediaURLs))
	item.FamilyID = nullInt64(familyID)
	item.AuthorID = nullInt64(authorID)
	item.IsPrivate = isPrivate
	item.CommentsEnabled = savedCommentsEnabled
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
		var isPrivate, commentsEnabled bool
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&item.ID, &item.BoardType, &familyID, &authorID, &item.AuthorName, &item.Title, &item.Body, &item.ViewCount, &isPrivate, &commentsEnabled, &createdAt, &updatedAt, &item.LikeCount, &item.DislikeCount, &item.MyReaction); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.FamilyID = nullInt64(familyID)
		item.AuthorID = nullInt64(authorID)
		item.IsPrivate = isPrivate
		item.CommentsEnabled = commentsEnabled
		item.MediaURLs = a.mediaURLs(ctx, "community_post_media_urls", "community_post_id", item.ID)
		item.CreatedAt = formatTime(createdAt)
		item.UpdatedAt = formatTime(updatedAt)
		items = append(items, item)
	}
	return items, true
}

func (a *app) communityPostByID(w http.ResponseWriter, ctx context.Context, postID, userID int64) (communityPostItem, bool) {
	rows, err := a.db.Query(ctx, `
		select p.id, p.board_type, p.family_id, p.author_id, p.author_name, p.title, p.body::text,
		       coalesce(p.view_count,0), coalesce(p.is_private,false), coalesce(p.comments_enabled,true), p.created_at, p.updated_at,
		       coalesce(reactions.like_count,0), coalesce(reactions.dislike_count,0), coalesce(my_reaction.reaction,'')
		from community_posts p
		left join lateral (
			select count(*) filter (where reaction = 'like') as like_count,
			       count(*) filter (where reaction = 'dislike') as dislike_count
			from community_post_reactions where community_post_id = p.id
		) reactions on true
		left join lateral (
			select reaction from community_post_reactions where community_post_id = p.id and user_id = $2
		) my_reaction on true
		where p.id = $1 and p.deleted_at is null
	`, postID, userID)
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

func (a *app) recordCommunityPostView(ctx context.Context, postID int64, userID int64) {
	tag, err := a.db.Exec(ctx, `
		insert into community_post_user_views (community_post_id, user_id, viewed_at)
		values ($1, $2, now())
		on conflict (community_post_id, user_id) do nothing
	`, postID, userID)
	if err != nil || tag.RowsAffected() == 0 {
		return
	}
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
		select id, post_id, parent_comment_id, author_id, author_name,
			case when deleted_at is null then body::text else '삭제된 댓글입니다.' end,
			deleted_at is not null, created_at, updated_at
		from community_comments c
		where post_id = $1
		  and (deleted_at is null or exists (
				select 1 from community_comments reply
				where reply.parent_comment_id = c.id and reply.deleted_at is null
			  ))
		order by coalesce(parent_comment_id, id), case when parent_comment_id is null then 0 else 1 end, created_at asc
	`, postID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return nil, false
	}
	defer rows.Close()
	items := []communityCommentItem{}
	for rows.Next() {
		var item communityCommentItem
		var parentCommentID, authorID sql.NullInt64
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&item.ID, &item.PostID, &parentCommentID, &authorID, &item.AuthorName, &item.Body, &item.IsDeleted, &createdAt, &updatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "database scan failed")
			return nil, false
		}
		item.ParentCommentID = nullInt64(parentCommentID)
		item.AuthorID = nullInt64(authorID)
		item.CreatedAt = formatTime(createdAt)
		item.UpdatedAt = formatTime(updatedAt)
		items = append(items, item)
	}
	return items, true
}

func (a *app) resolveCommunityCommentParent(w http.ResponseWriter, ctx context.Context, postID int64, requestedParentID *int64) (*int64, *int64, bool) {
	if requestedParentID == nil || *requestedParentID <= 0 {
		return nil, nil, true
	}
	var parentPostID int64
	var parentParentID, parentAuthorID sql.NullInt64
	var deletedAt sql.NullTime
	err := a.db.QueryRow(ctx, `
		select post_id, parent_comment_id, author_id, deleted_at
		from community_comments where id = $1
	`, *requestedParentID).Scan(&parentPostID, &parentParentID, &parentAuthorID, &deletedAt)
	if errors.Is(err, pgx.ErrNoRows) || deletedAt.Valid {
		writeError(w, http.StatusBadRequest, "parent comment is unavailable")
		return nil, nil, false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "parent comment read failed")
		return nil, nil, false
	}
	if parentPostID != postID {
		writeError(w, http.StatusBadRequest, "parent comment does not belong to this post")
		return nil, nil, false
	}
	parentID := *requestedParentID
	if parentParentID.Valid {
		parentID = parentParentID.Int64
		err = a.db.QueryRow(ctx, "select author_id from community_comments where id = $1", parentID).Scan(&parentAuthorID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "parent comment is unavailable")
			return nil, nil, false
		}
	}
	return &parentID, nullInt64(parentAuthorID), true
}

func communityCommentNotificationRecipient(parentAuthorID, postAuthorID *int64, isReply bool, actorID int64) *int64 {
	recipient := postAuthorID
	if isReply {
		recipient = parentAuthorID
	}
	if recipient == nil || *recipient == actorID {
		return nil
	}
	return recipient
}

func (a *app) notifyCommunityComment(ctx context.Context, post communityPostItem, comment communityCommentItem, parentAuthorID *int64, actorID int64) {
	isReply := comment.ParentCommentID != nil
	recipient := communityCommentNotificationRecipient(parentAuthorID, post.AuthorID, isReply, actorID)
	if recipient == nil {
		return
	}
	title := "새 댓글"
	if isReply {
		title = "새 대댓글"
	}
	body := comment.AuthorName + "님이 " + title + "을 남겼습니다."
	var familyID any
	if post.FamilyID != nil {
		familyID = *post.FamilyID
	} else {
		familyID = 0
	}
	_, err := a.db.Exec(ctx, `
		insert into app_notifications (user_id, family_id, community_post_id, community_comment_id, type, title, body, target_date, created_at)
		values ($1,$2,$3,$4,$5,$6,$7,current_date,now())
	`, *recipient, familyID, post.ID, comment.ID, map[bool]string{false: "COMMUNITY_COMMENT", true: "COMMUNITY_REPLY"}[isReply], title, body)
	if err != nil {
		a.log.Warn("community comment notification save failed", "error", err)
		return
	}
	a.sendPushToUserWithData(ctx, *recipient, title, body, map[string]string{
		"communityPostId":    strconv.FormatInt(post.ID, 10),
		"communityCommentId": strconv.FormatInt(comment.ID, 10),
	})
}

func (a *app) commentOwner(w http.ResponseWriter, ctx context.Context, commentID int64) (communityCommentItem, bool) {
	rows, err := a.db.Query(ctx, `select id, post_id, parent_comment_id, author_id, author_name, body::text, created_at, updated_at from community_comments where id = $1 and deleted_at is null`, commentID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database read failed")
		return communityCommentItem{}, false
	}
	defer rows.Close()
	items := []communityCommentItem{}
	for rows.Next() {
		var item communityCommentItem
		var parentCommentID, authorID sql.NullInt64
		var createdAt, updatedAt time.Time
		if rows.Scan(&item.ID, &item.PostID, &parentCommentID, &authorID, &item.AuthorName, &item.Body, &createdAt, &updatedAt) == nil {
			item.ParentCommentID = nullInt64(parentCommentID)
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
	var scheduleID, communityPostID, communityCommentID sql.NullInt64
	var targetDate time.Time
	var readAt sql.NullTime
	var createdAt time.Time
	if err := row.Scan(&item.ID, &item.UserID, &item.FamilyID, &scheduleID, &communityPostID, &communityCommentID, &item.Type, &item.Title, &item.Body, &targetDate, &readAt, &createdAt); err != nil {
		writeError(w, http.StatusNotFound, "notification not found")
		return item, false
	}
	item.ScheduleID = nullInt64(scheduleID)
	item.CommunityPostID = nullInt64(communityPostID)
	item.CommunityCommentID = nullInt64(communityCommentID)
	item.TargetDate = formatDate(targetDate)
	if readAt.Valid {
		value := formatTime(readAt.Time)
		item.ReadAt = &value
	}
	item.CreatedAt = formatTime(createdAt)
	return item, true
}
