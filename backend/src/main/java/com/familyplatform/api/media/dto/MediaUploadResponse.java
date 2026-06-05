package com.familyplatform.api.media.dto;

public record MediaUploadResponse(
    String url,
    String fileName,
    String originalFileName,
    String contentType,
    long size
) {
}
