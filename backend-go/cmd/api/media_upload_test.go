package main

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"
)

func mediaUploadRequest(t *testing.T, size int) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreatePart(textproto.MIMEHeader{
		"Content-Disposition": {`form-data; name="file"; filename="movie.mp4"`},
		"Content-Type":        {"video/mp4"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(bytes.Repeat([]byte{0x5a}, size)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/media", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return request
}

func TestUploadMediaSkipsSizeLimitUntilPolicyIsEnabled(t *testing.T) {
	application := &app{
		cfg: config{
			maxVideoBytes:          1024,
			mediaSizeLimitsEnabled: false,
		},
		mediaStore: localMediaStore{basePath: t.TempDir()},
	}
	response := httptest.NewRecorder()

	application.uploadMedia(response, mediaUploadRequest(t, 64*1024), authUser{})

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestUploadMediaAppliesSizeLimitWhenPolicyIsEnabled(t *testing.T) {
	application := &app{
		cfg: config{
			maxVideoBytes:          1024,
			mediaSizeLimitsEnabled: true,
		},
		mediaStore: localMediaStore{basePath: t.TempDir()},
	}
	response := httptest.NewRecorder()

	application.uploadMedia(response, mediaUploadRequest(t, 64*1024), authUser{})

	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestMediaURLsRemovedKeepsStillReferencedFiles(t *testing.T) {
	removed := mediaURLsRemoved(
		[]string{"/api/media/files/keep.jpg", "/api/media/files/remove.mp4", "/api/media/files/remove.mp4"},
		[]string{"/api/media/files/keep.jpg", "/api/media/files/new.jpg"},
	)
	if len(removed) != 1 || removed[0] != "/api/media/files/remove.mp4" {
		t.Fatalf("removed = %#v", removed)
	}
}

func TestMediaReferencesRejectMoreThanConfiguredPostLimit(t *testing.T) {
	application := &app{cfg: config{maxFilesPerPost: 5, maxReferenceLength: 2048}}
	response := httptest.NewRecorder()

	_, ok := application.validateMediaReferencesForMenu(response, "diary", []string{"1", "2", "3", "4", "5", "6"})

	if ok || response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("ok = %v, status = %d, body = %s", ok, response.Code, response.Body.String())
	}
}
