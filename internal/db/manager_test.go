package db

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func createTestDatabase(t *testing.T, dir, name string) string {
	t.Helper()

	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}

	path := filepath.Join(dir, name)
	database, err := NewSQLiteDB(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}

	return path
}

func TestManagerRequiresPaths(t *testing.T) {
	if _, err := NewManager(nil); err == nil {
		t.Error("Expected an error when no database paths are given")
	}
}

func TestManagerNamesAndDefault(t *testing.T) {
	dir := t.TempDir()
	first := createTestDatabase(t, filepath.Join(dir, "one"), "data.db")
	second := createTestDatabase(t, filepath.Join(dir, "two"), "data.db")

	manager, err := NewManager([]string{first, second})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()

	names := manager.Names()
	if len(names) != 2 {
		t.Fatalf("Expected 2 databases, got %d", len(names))
	}
	if names[0] != "data.db" || names[1] != "data-2.db" {
		t.Errorf("Expected unique names [data.db data-2.db], got %v", names)
	}

	if manager.DefaultName() != "data.db" {
		t.Errorf("Expected first database to be the default, got %q", manager.DefaultName())
	}

	database, err := manager.Get("")
	if err != nil {
		t.Fatal(err)
	}
	if database.Path() != first {
		t.Errorf("Expected default database path %q, got %q", first, database.Path())
	}

	infos := manager.List()
	if !infos[0].Default || infos[1].Default {
		t.Error("Expected only the first database to be the default")
	}
	if infos[1].Path != second {
		t.Errorf("Expected second database path %q, got %q", second, infos[1].Path)
	}
}

func TestManagerDeduplicatesPaths(t *testing.T) {
	dir := t.TempDir()
	path := createTestDatabase(t, dir, "data.db")

	manager, err := NewManager([]string{path, path})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()

	if names := manager.Names(); len(names) != 1 {
		t.Errorf("Expected duplicate paths to be registered once, got %v", names)
	}
}

func TestManagerUnknownDatabase(t *testing.T) {
	dir := t.TempDir()
	path := createTestDatabase(t, dir, "data.db")

	manager, err := NewManager([]string{path})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()

	if _, err := manager.Get("missing.db"); !errors.Is(err, ErrDatabaseNotFound) {
		t.Errorf("Expected ErrDatabaseNotFound, got %v", err)
	}
}

func TestManagerMissingDirectory(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing", "data.db")

	if _, err := NewManager([]string{missing}); err == nil {
		t.Fatal("Expected an error for a database in a missing directory")
	} else if !strings.Contains(err.Error(), "does not exist") {
		t.Errorf("Expected a 'does not exist' error, got %v", err)
	}
}
