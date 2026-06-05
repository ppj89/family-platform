package com.familyplatform.api.travel;

import com.familyplatform.api.travel.dto.TravelRecordRequest;
import com.familyplatform.api.travel.dto.TripRequest;
import com.familyplatform.api.security.FamilyAccessService;
import com.familyplatform.api.security.FamilyPermission;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import java.math.BigDecimal;
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
public class TravelController {
  private final TripRepository trips;
  private final TravelRecordRepository records;
  private final FamilyAccessService access;

  public TravelController(TripRepository trips, TravelRecordRepository records, FamilyAccessService access) {
    this.trips = trips;
    this.records = records;
    this.access = access;
  }

  @GetMapping("/trips")
  public List<Trip> listTrips(@RequestParam(defaultValue = "1") Long familyId) {
    access.require(familyId, FamilyPermission.READ);
    return trips.findByFamilyIdOrderByCreatedAtDesc(familyId);
  }

  @PostMapping("/trips")
  @ResponseStatus(HttpStatus.CREATED)
  public Trip createTrip(@RequestParam(defaultValue = "1") Long familyId, @Valid @RequestBody TripRequest request) {
    access.require(familyId, FamilyPermission.CREATE);
    validateDateRange(request.startDate(), request.endDate());
    return trips.save(new Trip(familyId, request.title().trim(), request.startDate(), request.endDate(), request.description()));
  }

  @PutMapping("/trips/{tripId}")
  public Trip updateTrip(@PathVariable Long tripId, @Valid @RequestBody TripRequest request) {
    validateDateRange(request.startDate(), request.endDate());
    Trip trip = trips.findById(tripId).orElseThrow(() -> notFound("Trip not found"));
    access.require(trip.getFamilyId(), FamilyPermission.UPDATE);
    trip.setTitle(request.title().trim());
    trip.setStartDate(request.startDate());
    trip.setEndDate(request.endDate());
    trip.setDescription(request.description());
    return trips.save(trip);
  }

  @DeleteMapping("/trips/{tripId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional
  public void deleteTrip(@PathVariable Long tripId) {
    if (!trips.existsById(tripId)) {
      throw notFound("Trip not found");
    }
    Trip trip = trips.findById(tripId).orElseThrow(() -> notFound("Trip not found"));
    access.require(trip.getFamilyId(), FamilyPermission.DELETE);
    records.deleteByTripId(tripId);
    trips.deleteById(tripId);
  }

  @GetMapping("/trips/{tripId}/records")
  public List<TravelRecord> listRecords(@PathVariable Long tripId) {
    Trip trip = ensureTrip(tripId);
    access.require(trip.getFamilyId(), FamilyPermission.READ);
    return records.findByTripIdOrderBySortOrderAscCreatedAtDesc(tripId);
  }

  @PostMapping("/trips/{tripId}/records")
  @ResponseStatus(HttpStatus.CREATED)
  public TravelRecord createRecord(@PathVariable Long tripId, @Valid @RequestBody TravelRecordRequest request) {
    Trip trip = ensureTrip(tripId);
    access.require(trip.getFamilyId(), FamilyPermission.CREATE);
    TravelRecord record = new TravelRecord();
    record.setTripId(tripId);
    applyRecordRequest(record, request);
    return records.save(record);
  }

  @PutMapping("/travel-records/{recordId}")
  public TravelRecord updateRecord(@PathVariable Long recordId, @Valid @RequestBody TravelRecordRequest request) {
    TravelRecord record = records.findById(recordId).orElseThrow(() -> notFound("Travel record not found"));
    Trip trip = ensureTrip(record.getTripId());
    access.require(trip.getFamilyId(), FamilyPermission.UPDATE);
    applyRecordRequest(record, request);
    return records.save(record);
  }

  @DeleteMapping("/travel-records/{recordId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteRecord(@PathVariable Long recordId) {
    TravelRecord record = records.findById(recordId).orElseThrow(() -> notFound("Travel record not found"));
    Trip trip = ensureTrip(record.getTripId());
    access.require(trip.getFamilyId(), FamilyPermission.DELETE);
    records.delete(record);
  }

  private void applyRecordRequest(TravelRecord record, TravelRecordRequest request) {
    record.setSortOrder(request.sortOrder());
    record.setTitle(request.title().trim());
    record.setCategory(request.category());
    record.setAmount(request.amount() == null ? BigDecimal.ZERO : request.amount());
    record.setNote(request.note());
    record.setLocation(request.location().trim());
    record.setLatitude(request.latitude());
    record.setLongitude(request.longitude());
    record.setRecordDate(request.recordDate());
    record.setRecordTime(request.recordTime());
    record.setMediaUrls(request.mediaUrls());
  }

  private Trip ensureTrip(Long tripId) {
    return trips.findById(tripId).orElseThrow(() -> notFound("Trip not found"));
  }

  private void validateDateRange(java.time.LocalDate startDate, java.time.LocalDate endDate) {
    if (endDate.isBefore(startDate)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "End date cannot be before start date");
    }
  }

  private ResponseStatusException notFound(String message) {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
  }
}
