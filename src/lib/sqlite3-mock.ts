import fs from 'fs';

export class Database {
  private filePath: string;
  constructor(filePath: string, callback?: (err: Error | null) => void) {
    this.filePath = filePath;
    if (callback) {
      setTimeout(() => callback(null), 0);
    }
  }

  run(sql: string, paramsOrCallback?: any, callback?: any) {
    let params: any[] = [];
    let cb: any = null;
    if (typeof paramsOrCallback === 'function') {
      cb = paramsOrCallback;
    } else {
      params = paramsOrCallback || [];
      cb = callback;
    }

    try {
      let data: any[] = [];
      const jsonPath = this.filePath.endsWith('.db') 
        ? this.filePath.replace(/\.db$/, '_db.json') 
        : this.filePath + '.json';

      if (fs.existsSync(jsonPath)) {
        const fileContent = fs.readFileSync(jsonPath, 'utf8');
        try {
          data = JSON.parse(fileContent);
        } catch (e) {
          data = [];
        }
      }
      
      const sqlUpper = sql.trim().toUpperCase();
      if (sqlUpper.startsWith('INSERT')) {
        data.push({
          sql,
          params,
          timestamp: new Date().toISOString()
        });
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
      }
      if (cb) {
        setTimeout(() => cb(null), 0);
      }
    } catch (err: any) {
      if (cb) {
        setTimeout(() => cb(err), 0);
      }
    }
  }

  all(sql: string, paramsOrCallback?: any, callback?: any) {
    let params: any[] = [];
    let cb: any = null;
    if (typeof paramsOrCallback === 'function') {
      cb = paramsOrCallback;
    } else {
      params = paramsOrCallback || [];
      cb = callback;
    }
    if (cb) {
      setTimeout(() => cb(null, []), 0);
    }
  }

  close(callback?: (err: Error | null) => void) {
    if (callback) {
      setTimeout(() => callback(null), 0);
    }
  }
}

const sqlite3Mock = {
  Database,
  verbose: () => sqlite3Mock
};

export default sqlite3Mock;
