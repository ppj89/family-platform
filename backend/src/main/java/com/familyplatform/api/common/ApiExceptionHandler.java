package com.familyplatform.api.common;

import java.time.Instant;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(MethodArgumentNotValidException.class)
  @ResponseStatus(HttpStatus.BAD_REQUEST)
  public Map<String, Object> validationError(MethodArgumentNotValidException exception) {
    FieldError fieldError = exception.getBindingResult().getFieldErrors().stream().findFirst().orElse(null);
    return Map.of(
        "time", Instant.now().toString(),
        "status", 400,
        "message", fieldError == null ? "Invalid request" : fieldError.getField() + " is invalid"
    );
  }

  @ExceptionHandler(ResponseStatusException.class)
  public ResponseEntity<Map<String, Object>> responseStatusError(ResponseStatusException exception) {
    Map<String, Object> body = Map.of(
        "time", Instant.now().toString(),
        "status", exception.getStatusCode().value(),
        "message", exception.getReason() == null ? "Request failed" : exception.getReason()
    );
    return ResponseEntity.status(exception.getStatusCode()).body(body);
  }
}
