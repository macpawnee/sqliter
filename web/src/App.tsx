import React, { useState, useEffect } from 'react';
import { Routes, Route, useParams, useNavigate, Link } from 'react-router-dom';
import { TableList } from './components/TableList';
import { TableView } from './components/TableView';
import { SqlEditor } from './components/SqlEditor';
import { ThemeToggle } from './components/ThemeToggle';
import { DatabaseSwitcher } from './components/DatabaseSwitcher';
import { ThemeProvider } from './contexts/ThemeContext';
import { api, setCurrentDatabase } from './api';
import { Table, DatabaseInfo } from './types';

const DATABASE_STORAGE_KEY = 'sqliter.selectedDatabase';

// Layout component that wraps all pages
function Layout({ children, tables, databaseInfo, pendingChangesByTable, databases, selectedDatabase, onDatabaseChange, switchingDatabase }: {
  children: React.ReactNode;
  tables: Table[];
  databaseInfo: DatabaseInfo | null;
  pendingChangesByTable: Record<string, number>;
  databases: DatabaseInfo[];
  selectedDatabase: string;
  onDatabaseChange: (databaseName: string) => void;
  switchingDatabase: boolean;
}) {
  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900 transition-colors">
      <header className="bg-blue-600 dark:bg-gray-700 text-white p-4">
        <div className="flex justify-between items-center gap-4">
          <div>
            <Link to="/" className="hover:opacity-80 transition-opacity">
              <h1 className="text-2xl font-bold flex items-center gap-2 text-white dark:text-gray-200">
                <i className="ti ti-database"></i>
                SQLiter
              </h1>
            </Link>
            <p className="text-blue-100 dark:text-gray-400 text-sm truncate max-w-md" title={databaseInfo?.path}>
              {databaseInfo ? databaseInfo.path : 'SQLite Database Editor'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <DatabaseSwitcher
              databases={databases}
              selected={selectedDatabase}
              onChange={onDatabaseChange}
              disabled={switchingDatabase}
            />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        <TableList
          tables={tables}
          pendingChangesByTable={pendingChangesByTable}
        />
        <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
          {children}
        </div>
      </div>
    </div>
  );
}

// Home page component
function HomePage() {
  return (
    <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900 h-full">
      <div className="text-center text-gray-500 dark:text-gray-400">
        <i className="ti ti-database text-6xl mb-4 text-gray-300 dark:text-gray-600 block"></i>
        <p className="text-lg">Select a table to view its contents or use the SQL Editor</p>
      </div>
    </div>
  );
}

// Table page component
function TablePage() {
  const { tableName } = useParams<{ tableName: string }>();
  const navigate = useNavigate();
  const [pendingChanges, setPendingChanges] = useState(0);

  const loadTables = async () => {
    // This would be called when tables are refreshed
    window.location.reload();
  };

  const handlePendingChangesUpdate = (table: string, count: number) => {
    setPendingChanges(count);
  };

  if (!tableName) {
    return <HomePage />;
  }

  return (
    <TableView
      tableName={tableName}
      onRefresh={loadTables}
      onPendingChangesUpdate={handlePendingChangesUpdate}
    />
  );
}

// SQL Editor page component
function SqlEditorPage() {
  const loadTables = async () => {
    // Refresh tables after SQL operations that might change schema
    window.location.reload();
  };

  return <SqlEditor onRefresh={loadTables} />;
}

function App() {
  const navigate = useNavigate();
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchingDatabase, setSwitchingDatabase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [databaseInfo, setDatabaseInfo] = useState<DatabaseInfo | null>(null);
  const [pendingChangesByTable, setPendingChangesByTable] = useState<Record<string, number>>({});

  const loadDatabase = async (databaseName: string) => {
    setCurrentDatabase(databaseName || null);
    const [fetchedTables, dbInfo] = await Promise.all([
      api.getTables(),
      api.getDatabaseInfo()
    ]);
    setTables(fetchedTables);
    setDatabaseInfo(dbInfo);
    setError(null);
  };

  const initialize = async () => {
    setSwitchingDatabase(true);
    try {
      const response = await api.getDatabases();
      const stored = localStorage.getItem(DATABASE_STORAGE_KEY);
      const initialDatabase =
        response.databases.find(database => database.name === stored)?.name ||
        response.databases.find(database => database.default)?.name ||
        response.databases[0]?.name ||
        '';

      setDatabases(response.databases);
      setSelectedDatabase(initialDatabase);
      await loadDatabase(initialDatabase);
    } catch (err) {
      setError('Failed to load databases');
      console.error('Error loading databases:', err);
    } finally {
      setSwitchingDatabase(false);
      setLoading(false);
    }
  };

  const handleDatabaseChange = async (databaseName: string) => {
    if (databaseName === selectedDatabase) return;

    setSelectedDatabase(databaseName);
    localStorage.setItem(DATABASE_STORAGE_KEY, databaseName);
    setTables([]);
    setPendingChangesByTable({});
    setSwitchingDatabase(true);

    // Table names differ between databases, so return to the start page.
    navigate('/');

    try {
      await loadDatabase(databaseName);
    } catch (err) {
      setError('Failed to load tables');
      console.error('Error switching database:', err);
    } finally {
      setSwitchingDatabase(false);
    }
  };

  useEffect(() => {
    initialize();
  }, []);

  const handlePendingChangesUpdate = (tableName: string, count: number) => {
    setPendingChangesByTable(prev => ({
      ...prev,
      [tableName]: count
    }));
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-xl text-gray-600 dark:text-gray-300">Loading SQLiter...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="text-xl text-red-600 dark:text-red-400 mb-4">{error}</div>
          <button
            onClick={initialize}
            className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <Routes>
      <Route path="/" element={
        <Layout
          tables={tables}
          databaseInfo={databaseInfo}
          pendingChangesByTable={pendingChangesByTable}
          databases={databases}
          selectedDatabase={selectedDatabase}
          onDatabaseChange={handleDatabaseChange}
          switchingDatabase={switchingDatabase}
        >
          <HomePage />
        </Layout>
      } />
      <Route path="/table/:tableName" element={
        <Layout
          tables={tables}
          databaseInfo={databaseInfo}
          pendingChangesByTable={pendingChangesByTable}
          databases={databases}
          selectedDatabase={selectedDatabase}
          onDatabaseChange={handleDatabaseChange}
          switchingDatabase={switchingDatabase}
        >
          <TablePage />
        </Layout>
      } />
      <Route path="/sql" element={
        <Layout
          tables={tables}
          databaseInfo={databaseInfo}
          pendingChangesByTable={pendingChangesByTable}
          databases={databases}
          selectedDatabase={selectedDatabase}
          onDatabaseChange={handleDatabaseChange}
          switchingDatabase={switchingDatabase}
        >
          <SqlEditorPage />
        </Layout>
      } />
      </Routes>
    </ThemeProvider>
  );
}

export default App;