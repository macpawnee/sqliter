package main

import (
	"io"
	"path/filepath"
	"reflect"
	"testing"
)

func TestParseCommandLine(t *testing.T) {
	tests := []struct {
		name      string
		args      []string
		wantPaths []string
		wantPort  string
	}{
		{
			name:      "single db flag",
			args:      []string{"--db", "one.db"},
			wantPaths: []string{"one.db"},
			wantPort:  defaultPort,
		},
		{
			name:      "repeated db flags",
			args:      []string{"--db", "one.db", "--db", "two.db"},
			wantPaths: []string{"one.db", "two.db"},
			wantPort:  defaultPort,
		},
		{
			name:      "comma separated",
			args:      []string{"--db", "one.db,two.db"},
			wantPaths: []string{"one.db", "two.db"},
			wantPort:  defaultPort,
		},
		{
			name:      "comma with trailing space split by the shell",
			args:      []string{"--db", "one.db,", "two.db"},
			wantPaths: []string{"one.db", "two.db"},
			wantPort:  defaultPort,
		},
		{
			name:      "quoted comma separated with spaces",
			args:      []string{"--db", "one.db, two.db"},
			wantPaths: []string{"one.db", "two.db"},
			wantPort:  defaultPort,
		},
		{
			name:      "positional paths",
			args:      []string{"one.db", "two.db"},
			wantPaths: []string{"one.db", "two.db"},
			wantPort:  defaultPort,
		},
		{
			name:      "flags after positional paths",
			args:      []string{"one.db", "two.db", "--port", "9000"},
			wantPaths: []string{"one.db", "two.db"},
			wantPort:  "9000",
		},
		{
			name:      "equals form",
			args:      []string{"--db=one.db,two.db", "--port=9001"},
			wantPaths: []string{"one.db", "two.db"},
			wantPort:  "9001",
		},
		{
			name:      "missing db flag value",
			args:      []string{"--db"},
			wantPaths: nil,
			wantPort:  "",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			paths, port, err := parseCommandLine(test.args, io.Discard)

			if test.wantPaths == nil {
				if err == nil {
					t.Fatal("Expected an error")
				}
				return
			}
			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}
			if !reflect.DeepEqual(paths, test.wantPaths) {
				t.Errorf("Expected paths %v, got %v", test.wantPaths, paths)
			}
			if port != test.wantPort {
				t.Errorf("Expected port %q, got %q", test.wantPort, port)
			}
		})
	}
}

func TestParseCommandLineExpandsHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	// The shell only expands the first tilde in a word, so the second path
	// arrives with a literal "~" that SQLiter has to resolve itself.
	paths, _, err := parseCommandLine([]string{"--db", "~/one.db,~/two.db"}, io.Discard)
	if err != nil {
		t.Fatal(err)
	}

	want := []string{filepath.Join(home, "one.db"), filepath.Join(home, "two.db")}
	if !reflect.DeepEqual(paths, want) {
		t.Errorf("Expected paths %v, got %v", want, paths)
	}

	positional, _, err := parseCommandLine([]string{"~/three.db"}, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{filepath.Join(home, "three.db")}; !reflect.DeepEqual(positional, want) {
		t.Errorf("Expected paths %v, got %v", want, positional)
	}
}
