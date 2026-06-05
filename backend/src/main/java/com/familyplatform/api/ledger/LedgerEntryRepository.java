package com.familyplatform.api.ledger;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, Long> {
  List<LedgerEntry> findByFamilyIdAndTransactionDateBetweenOrderByTransactionDateDescCreatedAtDesc(
      Long familyId, LocalDate startDate, LocalDate endDate);
}
