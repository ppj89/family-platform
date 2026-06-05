package com.familyplatform.api.ledger.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

public record LedgerEntryRequest(
    @NotBlank String title,
    @NotBlank String entryType,
    String category,
    String paymentMethod,
    String memberName,
    @NotNull BigDecimal amount,
    @NotNull LocalDate transactionDate,
    String memo
) {
}
