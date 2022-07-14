import { ActiveDoc } from 'app/server/lib/ActiveDoc';
import { create } from 'app/server/lib/create';
import { DocManager } from 'app/server/lib/DocManager';
import { makeExceptionalDocSession } from 'app/server/lib/DocSession';
import { DocStorageManager } from 'app/server/lib/DocStorageManager';
import { PluginManager } from 'app/server/lib/PluginManager';

import * as childProcess from 'child_process';
import * as fse from 'fs-extra';
import * as util from 'util';

const execFile = util.promisify(childProcess.execFile);

// tslint:disable:no-console

/**
 * Output to stdout typescript code containing SQL strings for creating an empty document.
 * The code is of the form:
 *   export const IRELIA_DOC_SQL = <sql code to create a completely empty document>;
 *   export const IRELIA_DOC_WITH_TABLE1_SQL = <sql code to create a document with Table1>;
 * Only tables managed by the data engine are included. Any _gristsys_ tables are excluded.
 */
export async function main(baseName: string) {
  console.log("/*** THIS FILE IS AUTO-GENERATED BY app/server/generateInitialDocSql.ts ***/");
  console.log("");
  console.log("/* eslint-disable max-len */");
  for (const version of ['DOC', 'DOC_WITH_TABLE1'] as const) {
    const storageManager = new DocStorageManager(process.cwd());
    const pluginManager = new PluginManager();
    const fname = storageManager.getPath(baseName);
    if (await fse.pathExists(fname)) {
      await fse.remove(fname);
    }
    const docManager = new DocManager(storageManager, pluginManager, null as any, {create} as any);
    const activeDoc = new ActiveDoc(docManager, baseName);
    const session = makeExceptionalDocSession('nascent');
    await activeDoc.createEmptyDocWithDataEngine(session);
    if (version === 'DOC_WITH_TABLE1') {
      await activeDoc.addInitialTable(session);
    }
    // Remove all _gristsys_ tables, since creation of these tables is handled by DocStorage,
    // not data engine.
    const tables = await activeDoc.docStorage.all("SELECT name FROM sqlite_master WHERE" +
                                                  " type = 'table' AND" +
                                                  " name LIKE '_gristsys_%'");
    for (const table of tables) {
      await activeDoc.docStorage.exec(`DROP TABLE ${table.name}`);
    }
    console.log("");
    console.log("export const IRELIA_" + version + "_SQL = `");
    console.log((await execFile('sqlite3', [baseName + '.grist', '.dump'])).stdout.trim());
    console.log("`;");
    await activeDoc.shutdown();
    await docManager.shutdownAll();
    await storageManager.closeStorage();
  }
}

if (require.main === module) {
  main(process.argv[2]).catch(e => {
    console.error(e);
  });
}
