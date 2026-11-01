import axios from 'axios';
import {
  Table,
  Column,
  TableData,
  InsertRequest,
  UpdateRequest,
  DeleteRequest,
  DatabaseInfo,
  DatabasesResponse,
  SQLQueryResult,
} from './types';

const API_BASE = '/api';

let currentDatabase: string | null = null;

// All requests are scoped to this database; the server falls back to its
// default database when it is not set.
export const setCurrentDatabase = (name: string | null) => {
  currentDatabase = name;
};

const client = axios.create({ baseURL: API_BASE });

client.interceptors.request.use((config) => {
  if (currentDatabase) {
    config.params = { ...(config.params || {}), db: currentDatabase };
  }
  return config;
});

export const api = {
  async getDatabases(): Promise<DatabasesResponse> {
    const response = await axios.get(`${API_BASE}/databases`);
    return response.data;
  },

  async getDatabaseInfo(): Promise<DatabaseInfo> {
    const response = await client.get('/info');
    return response.data;
  },

  async getTables(): Promise<Table[]> {
    const response = await client.get('/tables');
    return response.data.tables;
  },

  async getTableSchema(tableName: string): Promise<Column[]> {
    const response = await client.get(`/tables/${tableName}/schema`);
    return response.data.columns;
  },

  async getTableData(tableName: string, limit = 100, offset = 0, sortColumn?: string, sortDirection?: 'asc' | 'desc', whereClause?: string): Promise<TableData> {
    const params: any = { limit, offset };
    if (sortColumn && sortDirection) {
      params.sort_column = sortColumn;
      params.sort_direction = sortDirection;
    }
    if (whereClause) {
      params.where_clause = whereClause;
    }
    const response = await client.get(`/tables/${tableName}/data`, {
      params
    });
    return response.data;
  },

  async insertRow(tableName: string, data: Record<string, any>): Promise<void> {
    const request: InsertRequest = { data };
    await client.post(`/tables/${tableName}/rows`, request);
  },

  async updateRow(tableName: string, data: Record<string, any>, where: Record<string, any>): Promise<void> {
    const request: UpdateRequest = { data, where };
    await client.put(`/tables/${tableName}/rows`, request);
  },

  async deleteRow(tableName: string, where: Record<string, any>): Promise<void> {
    const request: DeleteRequest = { where };
    await client.delete(`/tables/${tableName}/rows`, { data: request });
  },

  async executeSQL(sql: string): Promise<SQLQueryResult> {
    const response = await client.post('/sql/execute', { sql });
    return response.data;
  },

  async exportTableCSV(tableName: string, sortColumn?: string, sortDirection?: 'asc' | 'desc', whereClause?: string): Promise<Blob> {
    const params: any = {};
    if (sortColumn && sortDirection) {
      params.sort_column = sortColumn;
      params.sort_direction = sortDirection;
    }
    if (whereClause) {
      params.where_clause = whereClause;
    }
    const response = await client.get(`/tables/${tableName}/export/csv`, {
      params,
      responseType: 'blob'
    });
    return response.data;
  },
};
