package com.familyplatform.api.baby;

import com.familyplatform.api.baby.dto.BabyProfileRequest;
import com.familyplatform.api.baby.dto.BabyRecordRequest;
import com.familyplatform.api.media.MediaPolicy;
import com.familyplatform.api.security.FamilyAccessService;
import com.familyplatform.api.security.FamilyPermission;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
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
@RequestMapping("/api")
public class BabyController {
  private final BabyProfileRepository babies;
  private final BabyRecordRepository records;
  private final FamilyAccessService access;
  private final MediaPolicy mediaPolicy;

  public BabyController(BabyProfileRepository babies, BabyRecordRepository records, FamilyAccessService access,
      MediaPolicy mediaPolicy) {
    this.babies = babies;
    this.records = records;
    this.access = access;
    this.mediaPolicy = mediaPolicy;
  }

  @GetMapping("/babies")
  public List<BabyProfile> listBabies(@RequestParam(defaultValue = "1") Long familyId) {
    access.require(familyId, FamilyPermission.READ);
    return babies.findByFamilyIdOrderByCreatedAtDesc(familyId);
  }

  @PostMapping("/babies")
  @ResponseStatus(HttpStatus.CREATED)
  public BabyProfile createBaby(@RequestParam(defaultValue = "1") Long familyId,
      @Valid @RequestBody BabyProfileRequest request) {
    access.require(familyId, FamilyPermission.CREATE);
    BabyProfile baby = new BabyProfile();
    baby.setFamilyId(familyId);
    applyBaby(baby, request);
    return babies.save(baby);
  }

  @PutMapping("/babies/{babyId}")
  public BabyProfile updateBaby(@PathVariable Long babyId, @Valid @RequestBody BabyProfileRequest request) {
    BabyProfile baby = babies.findById(babyId).orElseThrow(() -> notFound("Baby profile not found"));
    access.require(baby.getFamilyId(), FamilyPermission.UPDATE);
    applyBaby(baby, request);
    return babies.save(baby);
  }

  @DeleteMapping("/babies/{babyId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional
  public void deleteBaby(@PathVariable Long babyId) {
    BabyProfile baby = babies.findById(babyId).orElseThrow(() -> notFound("Baby profile not found"));
    access.require(baby.getFamilyId(), FamilyPermission.DELETE);
    records.deleteByBabyId(babyId);
    babies.deleteById(babyId);
  }

  @GetMapping("/babies/{babyId}/records")
  public List<BabyRecord> listRecords(@PathVariable Long babyId,
      @RequestParam(required = false) LocalDate startDate,
      @RequestParam(required = false) LocalDate endDate) {
    BabyProfile baby = ensureBaby(babyId);
    access.require(baby.getFamilyId(), FamilyPermission.READ);
    if (startDate != null && endDate != null) {
      return records.findByBabyIdAndRecordDateBetweenOrderByRecordDateDescCreatedAtDesc(babyId, startDate, endDate);
    }
    return records.findByBabyIdOrderByRecordDateDescCreatedAtDesc(babyId);
  }

  @PostMapping("/babies/{babyId}/records")
  @ResponseStatus(HttpStatus.CREATED)
  public BabyRecord createRecord(@PathVariable Long babyId, @Valid @RequestBody BabyRecordRequest request) {
    BabyProfile baby = ensureBaby(babyId);
    access.require(baby.getFamilyId(), FamilyPermission.CREATE);
    BabyRecord record = new BabyRecord();
    record.setBabyId(babyId);
    applyRecord(record, request);
    syncLatestGrowth(babyId, request);
    return records.save(record);
  }

  @PutMapping("/baby-records/{recordId}")
  public BabyRecord updateRecord(@PathVariable Long recordId, @Valid @RequestBody BabyRecordRequest request) {
    BabyRecord record = records.findById(recordId).orElseThrow(() -> notFound("Baby record not found"));
    BabyProfile baby = ensureBaby(record.getBabyId());
    access.require(baby.getFamilyId(), FamilyPermission.UPDATE);
    applyRecord(record, request);
    syncLatestGrowth(record.getBabyId(), request);
    return records.save(record);
  }

  @DeleteMapping("/baby-records/{recordId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteRecord(@PathVariable Long recordId) {
    BabyRecord record = records.findById(recordId).orElseThrow(() -> notFound("Baby record not found"));
    BabyProfile baby = ensureBaby(record.getBabyId());
    access.require(baby.getFamilyId(), FamilyPermission.DELETE);
    records.delete(record);
  }

  private void applyBaby(BabyProfile baby, BabyProfileRequest request) {
    baby.setName(request.name().trim());
    baby.setGender(request.gender());
    baby.setBirthDate(request.birthDate());
    baby.setMemo(request.memo());
    baby.setPhotoUrl(mediaPolicy.validateReference(request.photoUrl()));
    baby.setLatestHeightCm(request.latestHeightCm());
    baby.setLatestWeightKg(request.latestWeightKg());
  }

  private void applyRecord(BabyRecord record, BabyRecordRequest request) {
    record.setRecordType(request.recordType().trim());
    record.setRecordDate(request.recordDate());
    record.setRecordTime(request.recordTime());
    record.setAmountMl(request.amountMl());
    record.setHeightCm(request.heightCm());
    record.setWeightKg(request.weightKg());
    record.setMemo(request.memo());
    record.setMediaUrls(mediaPolicy.validateReferences(request.mediaUrls()));
  }

  private void syncLatestGrowth(Long babyId, BabyRecordRequest request) {
    if (request.heightCm() == null && request.weightKg() == null) {
      return;
    }
    BabyProfile baby = babies.findById(babyId).orElseThrow(() -> notFound("Baby profile not found"));
    if (request.heightCm() != null) {
      baby.setLatestHeightCm(request.heightCm());
    }
    if (request.weightKg() != null) {
      baby.setLatestWeightKg(request.weightKg());
    }
    babies.save(baby);
  }

  private BabyProfile ensureBaby(Long babyId) {
    return babies.findById(babyId).orElseThrow(() -> notFound("Baby profile not found"));
  }

  private ResponseStatusException notFound(String message) {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
  }
}
