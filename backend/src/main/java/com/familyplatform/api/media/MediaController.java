package com.familyplatform.api.media;

import com.familyplatform.api.media.dto.MediaUploadResponse;
import com.familyplatform.api.security.FamilyAccessService;
import com.familyplatform.api.security.FamilyPermission;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/media")
public class MediaController {
  private final Path storagePath;
  private final String publicUrlPrefix;
  private final MediaPolicy mediaPolicy;
  private final FamilyAccessService access;

  public MediaController(
      @Value("${app.media.storage-path:uploads}") String storagePath,
      @Value("${app.media.public-url-prefix:/api/media/files}") String publicUrlPrefix,
      MediaPolicy mediaPolicy,
      FamilyAccessService access) {
    this.storagePath = Path.of(storagePath).toAbsolutePath().normalize();
    this.publicUrlPrefix = publicUrlPrefix.endsWith("/")
        ? publicUrlPrefix.substring(0, publicUrlPrefix.length() - 1)
        : publicUrlPrefix;
    this.mediaPolicy = mediaPolicy;
    this.access = access;
    createStorageDirectory();
  }

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public MediaUploadResponse upload(@RequestParam MultipartFile file,
      @RequestParam(required = false) Long familyId) {
    access.currentUser();
    if (familyId != null) {
      access.require(familyId, FamilyPermission.CREATE);
    }
    mediaPolicy.validateUpload(file);
    String storedFileName = storedFileName(file);
    Path target = storagePath.resolve(storedFileName).normalize();
    if (!target.startsWith(storagePath)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid file path");
    }
    try {
      Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);
    } catch (IOException exception) {
      throw new UncheckedIOException(exception);
    }
    return new MediaUploadResponse(publicUrlPrefix + "/" + storedFileName, storedFileName,
        file.getOriginalFilename(), file.getContentType(), file.getSize());
  }

  @GetMapping("/files/{fileName}")
  public ResponseEntity<Resource> download(@PathVariable String fileName) {
    String cleanName = Path.of(fileName).getFileName().toString();
    Path file = storagePath.resolve(cleanName).normalize();
    if (!file.startsWith(storagePath) || !Files.exists(file)) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "File not found");
    }
    try {
      Resource resource = new UrlResource(file.toUri());
      String contentType = Files.probeContentType(file);
      String encodedName = URLEncoder.encode(cleanName, StandardCharsets.UTF_8).replace("+", "%20");
      return ResponseEntity.ok()
          .contentType(MediaType.parseMediaType(contentType == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : contentType))
          .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename*=UTF-8''" + encodedName)
          .body(resource);
    } catch (IOException exception) {
      throw new UncheckedIOException(exception);
    }
  }

  private void createStorageDirectory() {
    try {
      Files.createDirectories(storagePath);
    } catch (IOException exception) {
      throw new UncheckedIOException(exception);
    }
  }

  private String storedFileName(MultipartFile file) {
    String extension = extension(file.getOriginalFilename());
    return UUID.randomUUID() + extension;
  }

  private String extension(String originalFileName) {
    if (originalFileName == null) {
      return "";
    }
    String cleanName = Path.of(originalFileName).getFileName().toString();
    int dot = cleanName.lastIndexOf('.');
    if (dot < 0 || dot == cleanName.length() - 1) {
      return "";
    }
    String extension = cleanName.substring(dot).toLowerCase(Locale.ROOT);
    return extension.length() > 12 ? "" : extension;
  }
}
