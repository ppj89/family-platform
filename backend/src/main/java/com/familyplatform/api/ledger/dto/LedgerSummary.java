package com.familyplatform.api.ledger.dto;

import java.math.BigDecimal;

public record LedgerSummary(
    BigDecimal expense,
    BigDecimal income,
    BigDecimal total
) {
}
