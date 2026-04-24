package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5"
)

type stubReadinessDB struct {
	pingErr  error
	queryErr error
	applied  bool
}

func (s stubReadinessDB) Ping(context.Context) error {
	return s.pingErr
}

func (s stubReadinessDB) QueryRow(context.Context, string, ...any) pgx.Row {
	return stubRow{applied: s.applied, err: s.queryErr}
}

type stubRow struct {
	applied bool
	err     error
}

func (r stubRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	*(dest[0].(*bool)) = r.applied
	return nil
}

func TestServerHealthReadyHandlerDBPingFailure(t *testing.T) {
	h := &serverHealth{
		db:              stubReadinessDB{pingErr: errors.New("db unavailable")},
		latestMigration: "056_example",
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	h.readyHandler(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rec.Code)
	}

	var resp readinessResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if resp.Status != "not_ready" {
		t.Fatalf("status = %q, want %q", resp.Status, "not_ready")
	}
	if resp.Checks.DB != "error" {
		t.Fatalf("db check = %q, want %q", resp.Checks.DB, "error")
	}
	if resp.Checks.Migrations != "unknown" {
		t.Fatalf("migrations check = %q, want %q", resp.Checks.Migrations, "unknown")
	}
}

func TestServerHealthReadyHandlerMigrationOutOfDate(t *testing.T) {
	h := &serverHealth{
		db:              stubReadinessDB{applied: false},
		latestMigration: "056_example",
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	h.readyHandler(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rec.Code)
	}

	var resp readinessResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if resp.Status != "not_ready" {
		t.Fatalf("status = %q, want %q", resp.Status, "not_ready")
	}
	if resp.Checks.DB != "ok" {
		t.Fatalf("db check = %q, want %q", resp.Checks.DB, "ok")
	}
	if resp.Checks.Migrations != "out_of_date" {
		t.Fatalf("migrations check = %q, want %q", resp.Checks.Migrations, "out_of_date")
	}
}
