import React from 'react';
import { DatabaseInfo } from '../types';

interface DatabaseSwitcherProps {
  databases: DatabaseInfo[];
  selected: string;
  onChange: (databaseName: string) => void;
  disabled?: boolean;
}

export const DatabaseSwitcher: React.FC<DatabaseSwitcherProps> = ({ databases, selected, onChange, disabled }) => {
  if (databases.length === 0) {
    return null;
  }

  const selectedDatabase = databases.find((database) => database.name === selected);

  // Nothing to switch between, so just show which database is open.
  if (databases.length === 1) {
    return (
      <span
        className="flex items-center gap-2 text-sm text-white dark:text-gray-200"
        title={selectedDatabase?.path}
      >
        <i className="ti ti-database"></i>
        <span className="font-medium">{databases[0].name}</span>
      </span>
    );
  }

  return (
    <label
      className="flex items-center gap-2 text-sm text-white dark:text-gray-200"
      title={selectedDatabase?.path}
    >
      <i className="ti ti-database"></i>
      <select
        aria-label="Select database"
        value={selected}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="max-w-xs bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-100 border border-blue-400 dark:border-gray-600 rounded-md px-2 py-1 text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-60 disabled:cursor-wait"
      >
        {databases.map((database) => (
          <option key={database.name} value={database.name} title={database.path}>
            {database.name}
          </option>
        ))}
      </select>
    </label>
  );
};
