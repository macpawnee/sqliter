package main

import (
	"embed"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sqliter/internal/api"
	"sqliter/internal/db"
	"strings"
)

const defaultPort = "2826"

//go:embed all:web/dist
var staticFiles embed.FS

// databasePaths collects every --db value, accepting both repeated flags and
// comma-separated lists such as "one.db,two.db".
type databasePaths []string

func (p *databasePaths) String() string {
	return strings.Join(*p, ",")
}

func (p *databasePaths) Set(value string) error {
	for _, path := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(path); trimmed != "" {
			*p = append(*p, trimmed)
		}
	}
	return nil
}

// expandPath resolves a leading "~" since the shell only expands the first
// tilde in a word, leaving paths like "~/one.db,~/two.db" partly unresolved.
func expandPath(path string) string {
	if path != "~" && !strings.HasPrefix(path, "~/") {
		return path
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return path
	}
	if path == "~" {
		return home
	}
	return filepath.Join(home, path[2:])
}

// reorderArgs moves positional arguments behind the flags so that the flag
// package can parse commands like "sqliter one.db two.db --port 9000".
func reorderArgs(args []string, flags *flag.FlagSet) []string {
	ordered := make([]string, 0, len(args))
	positional := make([]string, 0, len(args))

	for i := 0; i < len(args); i++ {
		arg := args[i]
		if !strings.HasPrefix(arg, "-") || arg == "-" {
			positional = append(positional, arg)
			continue
		}

		ordered = append(ordered, arg)

		name := strings.TrimPrefix(strings.TrimPrefix(arg, "-"), "-")
		if strings.Contains(name, "=") {
			continue
		}

		f := flags.Lookup(name)
		if f == nil {
			continue
		}
		if boolean, ok := f.Value.(interface{ IsBoolFlag() bool }); ok && boolean.IsBoolFlag() {
			continue
		}

		// Keep the flag's value next to it.
		if i+1 < len(args) {
			i++
			ordered = append(ordered, args[i])
		}
	}

	return append(ordered, positional...)
}

// parseCommandLine resolves the database paths and port from the arguments.
// Database paths may be given with --db (repeatable or comma-separated) or as
// positional arguments.
func parseCommandLine(args []string, output io.Writer) ([]string, string, error) {
	flags := flag.NewFlagSet("sqliter", flag.ContinueOnError)
	flags.SetOutput(output)

	port := flags.String("port", defaultPort, "Port to run the server on")
	var dbPaths databasePaths
	flags.Var(&dbPaths, "db", "Path to a SQLite database file. Repeat the flag, pass a comma-separated list, or list files as arguments")

	if err := flags.Parse(reorderArgs(args, flags)); err != nil {
		return nil, "", err
	}

	paths := append([]string(dbPaths), flags.Args()...)
	for i, path := range paths {
		paths[i] = expandPath(path)
	}

	return paths, *port, nil
}

func main() {
	paths, port, err := parseCommandLine(os.Args[1:], os.Stderr)
	if err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return
		}
		os.Exit(2)
	}

	if len(paths) == 0 {
		log.Fatal("At least one database path is required. Use --db flag or pass database files as arguments.")
	}

	databases, err := db.NewManager(paths)
	if err != nil {
		log.Fatalf("Failed to open databases: %v", err)
	}
	defer databases.Close()

	// Create sub-filesystem for the dist directory
	distFS, err := fs.Sub(staticFiles, "web/dist")
	if err != nil {
		log.Fatalf("Failed to create sub-filesystem for static files: %v", err)
	}

	handler := api.NewHandler(databases, distFS)
	router := handler.SetupRoutes()

	fmt.Printf("Starting SQLiter on port %s with databases: %s\n", port, strings.Join(databases.Names(), ", "))
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
