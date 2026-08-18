package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"path/filepath"
)

const (
	mediaThumbnailMaxSide  = 256
	mediaThumbnailMaxBytes = 512 * 1024
	mediaDisplayMaxSide    = 1600
	mediaDisplayMaxBytes   = 2500 * 1024
)

func mediaThumbnailName(fileName string) string {
	return filepath.Base(fileName) + ".thumb-v2.jpg"
}

func legacyMediaThumbnailName(fileName string) string {
	return filepath.Base(fileName) + ".thumb.jpg"
}

func mediaDisplayName(fileName string) string {
	return filepath.Base(fileName) + ".display-v1.jpg"
}

func (a *app) openRequestedMedia(ctx context.Context, fileName, variant string) (io.ReadCloser, string, error) {
	if variant == "thumbnail" {
		return a.openMediaImageVariant(ctx, fileName, mediaThumbnailName(fileName), legacyMediaThumbnailName(fileName), mediaThumbnailMaxSide, 76, mediaThumbnailMaxBytes)
	}
	if variant == "display" {
		return a.openMediaImageVariant(ctx, fileName, mediaDisplayName(fileName), "", mediaDisplayMaxSide, 82, mediaDisplayMaxBytes)
	}
	return a.mediaStore.Open(ctx, fileName)
}

func (a *app) openMediaImageVariant(ctx context.Context, fileName, variantName, legacyVariantName string, maxSide, quality, maxBytes int) (io.ReadCloser, string, error) {
	if variantName == "" {
		return a.mediaStore.Open(ctx, fileName)
	}

	if file, contentType, err := a.mediaStore.Open(ctx, variantName); err == nil {
		return file, contentType, nil
	}

	original, _, err := a.mediaStore.Open(ctx, fileName)
	if err != nil {
		return nil, "", err
	}
	variant, variantErr := makeMediaImageVariant(original, maxSide, quality)
	_ = original.Close()
	if variantErr != nil {
		// Unsupported image formats continue to work by serving their original file.
		return a.mediaStore.Open(ctx, fileName)
	}

	if _, err := a.mediaStore.Save(ctx, variantName, bytes.NewReader(variant), "image/jpeg", int64(maxBytes)); err != nil {
		if file, contentType, openErr := a.mediaStore.Open(ctx, variantName); openErr == nil {
			return file, contentType, nil
		}
		return io.NopCloser(bytes.NewReader(variant)), "image/jpeg", nil
	}
	if legacyVariantName != "" {
		_ = a.mediaStore.Delete(ctx, legacyVariantName)
	}
	return io.NopCloser(bytes.NewReader(variant)), "image/jpeg", nil
}

func makeMediaThumbnail(source io.Reader) ([]byte, error) {
	return makeMediaImageVariant(source, mediaThumbnailMaxSide, 76)
}

func makeMediaDisplay(source io.Reader) ([]byte, error) {
	return makeMediaImageVariant(source, mediaDisplayMaxSide, 82)
}

func makeMediaImageVariant(source io.Reader, maxSide, quality int) ([]byte, error) {
	data, err := io.ReadAll(source)
	if err != nil {
		return nil, err
	}
	decoded, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	decoded = orientJPEGImage(decoded, jpegEXIFOrientation(data))
	bounds := decoded.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width <= 0 || height <= 0 {
		return nil, image.ErrFormat
	}
	scale := float64(maxSide) / float64(max(width, height))
	if scale > 1 {
		scale = 1
	}
	targetWidth := max(1, int(float64(width)*scale))
	targetHeight := max(1, int(float64(height)*scale))
	target := image.NewRGBA(image.Rect(0, 0, targetWidth, targetHeight))

	for y := 0; y < targetHeight; y++ {
		sourceY := bounds.Min.Y + y*height/targetHeight
		for x := 0; x < targetWidth; x++ {
			sourceX := bounds.Min.X + x*width/targetWidth
			target.Set(x, y, decoded.At(sourceX, sourceY))
		}
	}

	var output bytes.Buffer
	if err := jpeg.Encode(&output, target, &jpeg.Options{Quality: quality}); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func jpegEXIFOrientation(data []byte) int {
	if len(data) < 4 || data[0] != 0xff || data[1] != 0xd8 {
		return 1
	}
	for offset := 2; offset+4 <= len(data); {
		if data[offset] != 0xff {
			offset++
			continue
		}
		for offset < len(data) && data[offset] == 0xff {
			offset++
		}
		if offset >= len(data) || data[offset] == 0xda || data[offset] == 0xd9 {
			break
		}
		marker := data[offset]
		offset++
		if offset+2 > len(data) {
			break
		}
		segmentLength := int(binary.BigEndian.Uint16(data[offset : offset+2]))
		if segmentLength < 2 || offset+segmentLength > len(data) {
			break
		}
		if marker == 0xe1 && segmentLength >= 10 && bytes.Equal(data[offset+2:offset+8], []byte("Exif\x00\x00")) {
			if orientation := exifOrientation(data[offset+8 : offset+segmentLength]); orientation >= 1 && orientation <= 8 {
				return orientation
			}
		}
		offset += segmentLength
	}
	return 1
}

func exifOrientation(tiff []byte) int {
	if len(tiff) < 8 {
		return 1
	}
	littleEndian := bytes.Equal(tiff[:2], []byte("II"))
	if !littleEndian && !bytes.Equal(tiff[:2], []byte("MM")) {
		return 1
	}
	readUint16 := func(value []byte) uint16 {
		if littleEndian {
			return binary.LittleEndian.Uint16(value)
		}
		return binary.BigEndian.Uint16(value)
	}
	readUint32 := func(value []byte) uint32 {
		if littleEndian {
			return binary.LittleEndian.Uint32(value)
		}
		return binary.BigEndian.Uint32(value)
	}
	if readUint16(tiff[2:4]) != 42 {
		return 1
	}
	ifdOffset := int(readUint32(tiff[4:8]))
	if ifdOffset < 0 || ifdOffset+2 > len(tiff) {
		return 1
	}
	entryCount := int(readUint16(tiff[ifdOffset : ifdOffset+2]))
	for index := 0; index < entryCount; index++ {
		entryOffset := ifdOffset + 2 + index*12
		if entryOffset+12 > len(tiff) {
			break
		}
		if readUint16(tiff[entryOffset:entryOffset+2]) != 0x0112 || readUint16(tiff[entryOffset+2:entryOffset+4]) != 3 || readUint32(tiff[entryOffset+4:entryOffset+8]) != 1 {
			continue
		}
		return int(readUint16(tiff[entryOffset+8 : entryOffset+10]))
	}
	return 1
}

func orientJPEGImage(source image.Image, orientation int) image.Image {
	if orientation <= 1 || orientation > 8 {
		return source
	}
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	swapsDimensions := orientation >= 5 && orientation <= 8
	targetWidth, targetHeight := width, height
	if swapsDimensions {
		targetWidth, targetHeight = height, width
	}
	target := image.NewRGBA(image.Rect(0, 0, targetWidth, targetHeight))
	for y := 0; y < targetHeight; y++ {
		for x := 0; x < targetWidth; x++ {
			var sourceX, sourceY int
			switch orientation {
			case 2:
				sourceX, sourceY = width-1-x, y
			case 3:
				sourceX, sourceY = width-1-x, height-1-y
			case 4:
				sourceX, sourceY = x, height-1-y
			case 5:
				sourceX, sourceY = y, x
			case 6:
				sourceX, sourceY = y, height-1-x
			case 7:
				sourceX, sourceY = width-1-y, height-1-x
			case 8:
				sourceX, sourceY = width-1-y, x
			}
			target.Set(x, y, source.At(bounds.Min.X+sourceX, bounds.Min.Y+sourceY))
		}
	}
	return target
}
