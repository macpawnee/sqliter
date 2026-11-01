package db

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sqliter/internal/models"
	"strings"
)

// ErrDatabaseNotFound is returned when a database name cannot be resolved.
var ErrDatabaseNotFound = errors.New("database not found")

type databaseEntry struct {
	name     string
	path     string
	database *SQLiteDB
}

// Manager owns the set of databases SQLiter serves and lets callers resolve a
// specific one by name.
type Manager struct {
	entries     []*databaseEntry
	byName      map[string]*databaseEntry
	defaultName string
}

// NewManager opens every database path and registers it under a unique name.
func NewManager(paths []string) (*Manager, error) {
	if len(paths) == 0 {
		return nil, fmt.Errorf("at least one database path is required")
	}

	m := &Manager{byName: make(map[string]*databaseEntry, len(paths))}

	for _, rawPath := range paths {
		cleaned := filepath.Clean(strings.TrimSpace(rawPath))
		if cleaned == "" || cleaned == "." {
			m.Close()
			return nil, fmt.Errorf("invalid database path: %q", rawPath)
		}

		if existing := m.findByPath(cleaned); existing != nil {
			continue
		}

		// SQLite creates missing files, but it cannot create missing directories.
		if dir := filepath.Dir(cleaned); dir != "." {
			if _, err := os.Stat(dir); err != nil {
				m.Close()
				if os.IsNotExist(err) {
					return nil, fmt.Errorf("cannot open database %s: directory %s does not exist", cleaned, dir)
				}
				return nil, fmt.Errorf("cannot access directory %s for database %s: %w", dir, cleaned, err)
			}
		}

		name := m.uniqueName(cleaned)

		database, err := NewSQLiteDB(cleaned)
		if err != nil {
			m.Close()
			return nil, fmt.Errorf("failed to open database %s: %w", cleaned, err)
		}

		entry := &databaseEntry{name: name, path: cleaned, database: database}
		m.entries = append(m.entries, entry)
		m.byName[name] = entry
	}

	if len(m.entries) == 0 {
		return nil, fmt.Errorf("at least one database path is required")
	}
	m.defaultName = m.entries[0].name

	return m, nil
}

func (m *Manager) findByPath(path string) *databaseEntry {
	for _, entry := range m.entries {
		if entry.path == path {
			return entry
		}
	}
	return nil
}

// uniqueName derives a name from the file name, appending a counter when two
// configured databases share the same base name.
func (m *Manager) uniqueName(path string) string {
	base := filepath.Base(path)
	if _, exists := m.byName[base]; !exists {
		return base
	}

	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	for i := 2; ; i++ {
		candidate := fmt.Sprintf("%s-%d%s", stem, i, ext)
		if _, exists := m.byName[candidate]; !exists {
			return candidate
		}
	}
}

// Get returns the database registered under name, or the default database when
// name is empty.
func (m *Manager) Get(name string) (*SQLiteDB, error) {
	entry, err := m.entry(name)
	if err != nil {
		return nil, err
	}
	return entry.database, nil
}

func (m *Manager) entry(name string) (*databaseEntry, error) {
	if name == "" {
		name = m.defaultName
	}

	entry, exists := m.byName[name]
	if !exists {
		return nil, fmt.Errorf("%w: %s", ErrDatabaseNotFound, name)
	}
	return entry, nil
}

// DefaultName is the name of the database used when no selection is made.
func (m *Manager) DefaultName() string {
	return m.defaultName
}

// Names lists the registered database names in configuration order.
func (m *Manager) Names() []string {
	names := make([]string, 0, len(m.entries))
	for _, entry := range m.entries {
		names = append(names, entry.name)
	}
	return names
}

// Info describes a single database.
func (m *Manager) Info(name string) (models.DatabaseInfo, error) {
	entry, err := m.entry(name)
	if err != nil {
		return models.DatabaseInfo{}, err
	}

	return models.DatabaseInfo{
		Name:     entry.name,
		Filename: entry.database.Filename(),
		Path:     entry.path,
		Default:  entry.name == m.defaultName,
	}, nil
}

// List describes every registered database.
func (m *Manager) List() []models.DatabaseInfo {
	infos := make([]models.DatabaseInfo, 0, len(m.entries))
	for _, entry := range m.entries {
		infos = append(infos, models.DatabaseInfo{
			Name:     entry.name,
			Filename: entry.database.Filename(),
			Path:     entry.path,
			Default:  entry.name == m.defaultName,
		})
	}
	return infos
}

// Close closes every open database connection.
func (m *Manager) Close() error {
	var errs []error
	for _, entry := range m.entries {
		if err := entry.database.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}
