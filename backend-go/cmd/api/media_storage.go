package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type mediaStore interface {
	Save(ctx context.Context, storedName string, source io.Reader, contentType string, limit int64) (int64, error)
	Open(ctx context.Context, storedName string) (io.ReadCloser, string, error)
	Delete(ctx context.Context, storedName string) error
}

func newMediaStore(ctx context.Context, cfg config) (mediaStore, error) {
	switch cfg.mediaStorageDriver {
	case "", "local":
		if err := os.MkdirAll(cfg.mediaStoragePath, 0750); err != nil {
			return nil, err
		}
		return localMediaStore{basePath: cfg.mediaStoragePath}, nil
	case "s3":
		if cfg.mediaS3Endpoint == "" || cfg.mediaS3Bucket == "" || cfg.mediaS3AccessKey == "" || cfg.mediaS3SecretKey == "" {
			return nil, errors.New("s3 media storage requires APP_MEDIA_S3_ENDPOINT, APP_MEDIA_S3_BUCKET, APP_MEDIA_S3_ACCESS_KEY_ID, and APP_MEDIA_S3_SECRET_ACCESS_KEY")
		}
		awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
			awsconfig.WithRegion(cfg.mediaS3Region),
			awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.mediaS3AccessKey, cfg.mediaS3SecretKey, "")),
		)
		if err != nil {
			return nil, err
		}
		client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(cfg.mediaS3Endpoint)
			o.UsePathStyle = true
		})
		return s3MediaStore{client: client, bucket: cfg.mediaS3Bucket}, nil
	default:
		return nil, fmt.Errorf("unsupported APP_MEDIA_STORAGE_DRIVER: %s", cfg.mediaStorageDriver)
	}
}

type localMediaStore struct {
	basePath string
}

func (s localMediaStore) Save(_ context.Context, storedName string, source io.Reader, _ string, limit int64) (int64, error) {
	target := filepath.Join(s.basePath, filepath.Base(storedName))
	out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0640)
	if err != nil {
		return 0, err
	}
	defer out.Close()
	reader := source
	if limit > 0 {
		reader = io.LimitReader(source, limit+1)
	}
	written, err := io.Copy(out, reader)
	if err != nil {
		_ = os.Remove(target)
		return 0, err
	}
	if limit > 0 && written > limit {
		_ = os.Remove(target)
		return written, errMediaTooLarge
	}
	return written, nil
}

func (s localMediaStore) Open(_ context.Context, storedName string) (io.ReadCloser, string, error) {
	fileName := filepath.Base(storedName)
	if fileName == "." || fileName == string(filepath.Separator) {
		return nil, "", os.ErrNotExist
	}
	file, err := os.Open(filepath.Join(s.basePath, fileName))
	if err != nil {
		return nil, "", err
	}
	contentType := mime.TypeByExtension(filepath.Ext(fileName))
	return file, contentType, nil
}

func (s localMediaStore) Delete(_ context.Context, storedName string) error {
	fileName := filepath.Base(storedName)
	if fileName == "." || fileName == string(filepath.Separator) {
		return os.ErrNotExist
	}
	err := os.Remove(filepath.Join(s.basePath, fileName))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

type s3MediaStore struct {
	client *s3.Client
	bucket string
}

func (s s3MediaStore) Save(ctx context.Context, storedName string, source io.Reader, contentType string, limit int64) (int64, error) {
	var body bytes.Buffer
	reader := source
	if limit > 0 {
		reader = io.LimitReader(source, limit+1)
	}
	written, err := io.Copy(&body, reader)
	if err != nil {
		return 0, err
	}
	if limit > 0 && written > limit {
		return written, errMediaTooLarge
	}
	if contentType == "" {
		contentType = http.DetectContentType(body.Bytes())
	}
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(filepath.Base(storedName)),
		Body:        bytes.NewReader(body.Bytes()),
		ContentType: aws.String(contentType),
	})
	return written, err
}

func (s s3MediaStore) Open(ctx context.Context, storedName string) (io.ReadCloser, string, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(filepath.Base(storedName)),
	})
	if err != nil {
		return nil, "", err
	}
	contentType := ""
	if out.ContentType != nil {
		contentType = *out.ContentType
	}
	return out.Body, contentType, nil
}

func (s s3MediaStore) Delete(ctx context.Context, storedName string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(filepath.Base(storedName)),
	})
	return err
}

var errMediaTooLarge = errors.New("media file is too large")
