package main

import (
	"bytes"
	"image"
	"image/jpeg"
	"testing"
)

func TestMakeMediaDisplayResizesForFastDetailRendering(t *testing.T) {
	sourceImage := image.NewRGBA(image.Rect(0, 0, 3200, 2000))
	var source bytes.Buffer
	if err := jpeg.Encode(&source, sourceImage, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}

	encoded, err := makeMediaDisplay(bytes.NewReader(source.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	decoded, _, err := image.Decode(bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	bounds := decoded.Bounds()
	if bounds.Dx() != mediaDisplayMaxSide || bounds.Dy() != 1000 {
		t.Fatalf("display dimensions = %dx%d, want 1600x1000", bounds.Dx(), bounds.Dy())
	}
}

func TestMakeMediaDisplayDoesNotUpscale(t *testing.T) {
	sourceImage := image.NewRGBA(image.Rect(0, 0, 640, 480))
	var source bytes.Buffer
	if err := jpeg.Encode(&source, sourceImage, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}

	encoded, err := makeMediaDisplay(bytes.NewReader(source.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	decoded, _, err := image.Decode(bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	bounds := decoded.Bounds()
	if bounds.Dx() != 640 || bounds.Dy() != 480 {
		t.Fatalf("display dimensions = %dx%d, want 640x480", bounds.Dx(), bounds.Dy())
	}
}
