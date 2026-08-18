package main

import (
	"reflect"
	"testing"
	"time"
)

func TestInstallmentAmountsKeepsTotalAndDistributesRemainder(t *testing.T) {
	amounts := installmentAmounts(100000, 3)
	if !reflect.DeepEqual(amounts, []int64{33334, 33333, 33333}) {
		t.Fatalf("unexpected installment amounts: %v", amounts)
	}
}

func TestInstallmentTransactionDateUsesLastDayOfTargetMonth(t *testing.T) {
	start := time.Date(2026, time.January, 31, 0, 0, 0, 0, time.UTC)
	got := installmentTransactionDate(start, 1)
	if got.Format("2006-01-02") != "2026-02-28" {
		t.Fatalf("unexpected target date: %s", got.Format("2006-01-02"))
	}
}
