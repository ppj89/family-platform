package com.familyplatform.api.ledger;

import com.familyplatform.api.ledger.dto.LedgerEntryRequest;
import com.familyplatform.api.ledger.dto.LedgerSummary;
import com.familyplatform.api.security.FamilyAccessService;
import com.familyplatform.api.security.FamilyPermission;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/ledger-entries")
public class LedgerController {
  private final LedgerEntryRepository ledgerEntries;
  private final FamilyAccessService access;

  public LedgerController(LedgerEntryRepository ledgerEntries, FamilyAccessService access) {
    this.ledgerEntries = ledgerEntries;
    this.access = access;
  }

  @GetMapping
  public List<LedgerEntry> list(@RequestParam(defaultValue = "1") Long familyId,
      @RequestParam LocalDate startDate, @RequestParam LocalDate endDate) {
    access.require(familyId, FamilyPermission.READ);
    return ledgerEntries.findByFamilyIdAndTransactionDateBetweenOrderByTransactionDateDescCreatedAtDesc(
        familyId, startDate, endDate);
  }

  @GetMapping("/summary")
  public LedgerSummary summary(@RequestParam(defaultValue = "1") Long familyId,
      @RequestParam LocalDate startDate, @RequestParam LocalDate endDate) {
    List<LedgerEntry> entries = list(familyId, startDate, endDate);
    BigDecimal expense = entries.stream()
        .filter(entry -> "expense".equals(entry.getEntryType()))
        .map(LedgerEntry::getAmount)
        .reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal income = entries.stream()
        .filter(entry -> "income".equals(entry.getEntryType()))
        .map(LedgerEntry::getAmount)
        .reduce(BigDecimal.ZERO, BigDecimal::add);
    return new LedgerSummary(expense, income, income.subtract(expense));
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public LedgerEntry create(@RequestParam(defaultValue = "1") Long familyId,
      @Valid @RequestBody LedgerEntryRequest request) {
    access.require(familyId, FamilyPermission.CREATE);
    LedgerEntry entry = new LedgerEntry();
    entry.setFamilyId(familyId);
    apply(entry, request);
    return ledgerEntries.save(entry);
  }

  @PutMapping("/{entryId}")
  public LedgerEntry update(@PathVariable Long entryId, @Valid @RequestBody LedgerEntryRequest request) {
    LedgerEntry entry = ledgerEntries.findById(entryId).orElseThrow(() -> notFound("Ledger entry not found"));
    access.require(entry.getFamilyId(), FamilyPermission.UPDATE);
    apply(entry, request);
    return ledgerEntries.save(entry);
  }

  @DeleteMapping("/{entryId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable Long entryId) {
    LedgerEntry entry = ledgerEntries.findById(entryId).orElseThrow(() -> notFound("Ledger entry not found"));
    access.require(entry.getFamilyId(), FamilyPermission.DELETE);
    ledgerEntries.delete(entry);
  }

  private void apply(LedgerEntry entry, LedgerEntryRequest request) {
    entry.setTitle(request.title().trim());
    entry.setEntryType(request.entryType());
    entry.setCategory(request.category());
    entry.setPaymentMethod(request.paymentMethod());
    entry.setMemberName(request.memberName());
    entry.setAmount(request.amount());
    entry.setTransactionDate(request.transactionDate());
    entry.setMemo(request.memo());
  }

  private ResponseStatusException notFound(String message) {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
  }
}
