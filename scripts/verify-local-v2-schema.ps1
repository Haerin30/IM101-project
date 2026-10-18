param(
    [switch]$StaticOnly,
    [string]$User = 'postgres'
)

# Fixed local endpoint: no URL/config/.env is loaded and no alternate host is allowed.
# Reads project files and PostgreSQL catalog metadata only. No output files are written.
$ErrorActionPreference = 'Stop'
$taskPreviousUser = [Environment]::GetEnvironmentVariable('PGUSER', 'Process')
$taskPreviousPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
$taskPreviousMode = [Environment]::GetEnvironmentVariable('IM101_SCHEMA_STATIC_ONLY', 'Process')
$taskPreviousRoot = [Environment]::GetEnvironmentVariable('IM101_SCHEMA_REVIEW_ROOT', 'Process')
$taskExitCode = 2

try {
    $env:IM101_SCHEMA_REVIEW_ROOT = Split-Path -Parent $PSScriptRoot
    $env:IM101_SCHEMA_STATIC_ONLY = if ($StaticOnly) { 'yes' } else { 'no' }
    if (-not $StaticOnly) {
        $taskCredential = Get-Credential -UserName $User -Message 'READ ONLY: 127.0.0.1:5432/im101_v2_schema_test'
        if ($null -eq $taskCredential) { throw 'Local credentials were not supplied.' }
        # Process-only credentials, inherited by Node and restored in finally.
        # Never print the environment, credential object or child connection settings.
        $env:PGUSER = $taskCredential.UserName
        $env:PGPASSWORD = $taskCredential.GetNetworkCredential().Password
    }

    @'
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = process.env.IM101_SCHEMA_REVIEW_ROOT;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const dbml = read('docs/professor-approved-schema.dbml');
const schema = read('prisma/schema.prisma');
const migrationFile = 'prisma/migrations/20261019020000_supabase_v2_init/migration.sql';
const sql = read(migrationFile);
const signature = value => JSON.stringify(value);
const sorted = values => values.map(signature).sort();
const columns = [], keys = [], foreignKeys = [];
const tables = [...dbml.matchAll(/^Table (\w+) \{([\s\S]*?)^\}/gm)];
const types = {int: 'int4', bigint: 'int8', smallint: 'int2', boolean: 'bool',
    text: 'text', date: 'date', timestamptz: 'timestamptz', jsonb: 'jsonb'};

for (const [, table, body] of tables) {
    const fields = [...body.matchAll(/^[ \t]*(\w+)[ \t]+(varchar\(\d+\)|int|bigint|smallint|boolean|text|date|timestamptz|jsonb)(?:[ \t]+\[([^\]]*)\])?[ \t]*$/gm)];
    let primary = [];
    const blockKeys = [];
    for (const line of (body.match(/indexes\s*\{([\s\S]*?)\}/)?.[1] || '')
        .split('\n').map(line => line.trim()).filter(Boolean)) {
        const match = line.match(/^\(([^)]+)\)(?:\s+\[(pk|unique)\])?$/);
        const fields = match ? match[1].split(',').map(name => name.trim()) : [line];
        if (match?.[2] === 'pk') primary = fields;
        else blockKeys.push([table, match?.[2] === 'unique' ? 'unique' : 'index', fields]);
    }
    for (const [, name, type, options = ''] of fields) {
        if (/\bpk\b/.test(options)) primary = [name];
        const varchar = type.match(/^varchar\((\d+)\)$/);
        let defaultKind = 'none', defaultValue = null;
        if (options.includes('increment')) defaultKind = 'sequence';
        else if (options.includes('default: `now()`')) defaultKind = 'now';
        else if (options.includes('default: `CURRENT_DATE`')) defaultKind = 'date';
        else if (options.includes('default: true')) defaultKind = 'boolean';
        else if (options.match(/default: '([^']+)'/)) {
            defaultKind = 'string'; defaultValue = options.match(/default: '([^']+)'/)[1];
        }
        columns.push({table, name, type: varchar ? 'varchar' : types[type],
            length: varchar ? Number(varchar[1]) : null,
            precision: type === 'timestamptz' ? 6 : null,
            required: options.includes('not null') || /\bpk\b/.test(options) || primary.includes(name),
            defaultKind, defaultValue});
        if (options.includes('unique')) keys.push([table, 'unique', [name]]);
    }
    keys.push([table, 'primary', primary], ...blockKeys);
}
for (const match of dbml.matchAll(/^Ref: (\w+)\.(\w+) > (\w+)\.(\w+)/gm)) {
    foreignKeys.push([match[1], [match[2]], match[3], [match[4]]]);
}
const names = tables.map(match => match[1]).sort();
const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
const generated = [...sql.matchAll(/CREATE TABLE "(\w+)" \(([\s\S]*?)\n\);/g)];
const sqlTypes = {int4: 'INTEGER', int8: 'BIGINT', int2: 'SMALLINT', bool: 'BOOLEAN',
    text: 'TEXT', date: 'DATE', timestamptz: 'TIMESTAMPTZ(6)', jsonb: 'JSONB'};
assert.equal(models.length, 16);
assert.deepEqual(models.map(match => match[2].match(/@@map\("([^"]+)"\)/)[1]).sort(), names);
assert.equal(columns.length, 97); assert.equal(foreignKeys.length, 24);
assert.deepEqual(generated.map(match => match[1]).sort(), names);
const modelFields = models.flatMap(match => {
    const table = match[2].match(/@@map\("([^"]+)"\)/)[1];
    return [...match[2].matchAll(/^[ \t]*(\w+)[ \t]+(Int|BigInt|String|Boolean|DateTime|Json)(\?)?[ \t]*(.*)$/gm)]
        .map(field => [table, field[4].match(/@map\("([^"]+)"\)/)?.[1] || field[1], !!field[3]]);
});
assert.deepEqual(sorted(modelFields), sorted(columns.map(column => [column.table,column.name,!column.required])));
let generatedFields = 0;
for (const [, table, body] of generated) {
    const actualFields = [...body.matchAll(/^[ \t]*"(\w+)"[ \t]+([A-Z]+(?:\(\d+\))?)([^\n]*)/gm)];
    const expected = columns.filter(column => column.table === table);
    assert.equal(actualFields.length, expected.length);
    for (const [, name, type, attrs] of actualFields) {
        const column = expected.find(column => column.name === name); assert.ok(column);
        const expectedType = column.defaultKind === 'sequence' ? (column.type === 'int8' ? 'BIGSERIAL' : 'SERIAL')
            : column.type === 'varchar' ? `VARCHAR(${column.length})` : sqlTypes[column.type];
        assert.equal(type, expectedType); assert.equal(attrs.includes('NOT NULL'), column.required);
        const expectedDefault = {now: 'CURRENT_TIMESTAMP', date: 'CURRENT_DATE', boolean: 'true',
            string: `'${column.defaultValue}'`}[column.defaultKind] || null;
        assert.equal(attrs.replace(/,$/,'').match(/DEFAULT (.*)$/)?.[1] || null, expectedDefault);
    }
    generatedFields += actualFields.length;
}
const generatedKeys = generated.map(([, table, body]) => [table, 'primary',
    [...body.match(/PRIMARY KEY \(([^)]+)\)/)[1].matchAll(/"(\w+)"/g)].map(match => match[1])]);
for (const match of sql.matchAll(/CREATE (UNIQUE )?INDEX "\w+" ON "(\w+)"\(([^)]+)\);/g))
    generatedKeys.push([match[2],match[1] ? 'unique' : 'index',[...match[3].matchAll(/"(\w+)"/g)].map(match => match[1])]);
assert.deepEqual(sorted(generatedKeys), sorted(keys));
const generatedRefs = [...sql.matchAll(/ALTER TABLE "(\w+)" ADD CONSTRAINT "\w+" FOREIGN KEY \("(\w+)"\) REFERENCES "(\w+)"\("(\w+)"\) ON DELETE NO ACTION ON UPDATE NO ACTION;/g)]
    .map(match => [match[1],[match[2]],match[3],[match[4]]]);
assert.deepEqual(sorted(generatedRefs), sorted(foreignKeys));
assert.equal(generatedFields,97);
console.log('STATIC FILE COMPARISON: PASS (16 models/tables, 97 fields, 24 FKs, 16 PKs, 9 unique and 6 nonunique indexes).');
console.log('INTERPRETATIONS: timestamptz precision 6; NO ACTION update/delete is proposed, not specified by DBML.');
if (process.env.IM101_SCHEMA_STATIC_ONLY === 'yes') {
    console.log('DATABASE RESULT: NOT RUN (static-only mode).');
} else {
    const {Client} = require(path.join(root,'node_modules','pg'));
    const target = {host:'127.0.0.1',port:5432,database:'im101_v2_schema_test'};
    const client = new Client({...target,user:process.env.PGUSER,password:process.env.PGPASSWORD,
        connectionTimeoutMillis:5000,application_name:'im101-read-only-schema-verification',
        options:'-c default_transaction_read_only=on -c statement_timeout=30000'});
    (async () => {
        let began = false;
        try {
            // Check fixed client parameters before any SQL or connection attempt.
            if (client.connectionParameters.host !== target.host || Number(client.connectionParameters.port) !== target.port
                || client.connectionParameters.database !== target.database) throw new Error('Rejected connection target');
            await client.connect();
            // The first SQL is only identity verification, already in read-only mode.
            const identity = (await client.query(`SELECT current_database() AS database,
                inet_server_addr()::text AS host,inet_server_port() AS port,
                current_setting('transaction_read_only') AS read_only`)).rows[0];
            if (identity.database !== target.database || identity.host !== target.host
                || identity.port !== target.port || identity.read_only !== 'on') throw new Error('Rejected server identity');
            console.log('TARGET VERIFIED:', JSON.stringify(identity));
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
            const tableRows = (await client.query(`SELECT c.relname AS name,c.relkind
                FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations'
                ORDER BY c.relname`)).rows;
            const actualColumns = (await client.query(`SELECT c.relname AS table,a.attname AS name,t.typname AS type,
                a.attnotnull AS required,CASE WHEN t.typname='varchar' THEN a.atttypmod-4 END AS length,
                CASE WHEN t.typname='timestamptz' THEN a.atttypmod END AS precision,
                pg_get_expr(d.adbin,d.adrelid) AS default_expression,
                pg_get_serial_sequence(format('%I.%I',n.nspname,c.relname),a.attname) AS owned_sequence,
                a.attidentity,a.attgenerated
                FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                JOIN pg_attribute a ON a.attrelid=c.oid JOIN pg_type t ON t.oid=a.atttypid
                LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
                WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations'
                  AND a.attnum>0 AND NOT a.attisdropped`)).rows;
            const indexes = (await client.query(`SELECT t.relname AS table,
                CASE WHEN i.indisprimary THEN 'primary' WHEN i.indisunique THEN 'unique' ELSE 'index' END AS kind,
                ARRAY(SELECT a.attname::text FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(num,ord)
                  JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.num WHERE k.ord<=i.indnkeyatts ORDER BY k.ord) AS columns,
                i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL
                  AND NOT i.indnullsnotdistinct AND i.indnatts=i.indnkeyatts AND am.amname='btree' AS valid
                FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
                JOIN pg_class ix ON ix.oid=i.indexrelid JOIN pg_am am ON am.oid=ix.relam
                WHERE n.nspname='public' AND t.relname<>'_prisma_migrations'`)).rows;
            const constraints = (await client.query(`SELECT c.conname AS name,c.contype AS kind,st.relname AS source,
                ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord)
                  JOIN pg_attribute a ON a.attrelid=st.oid AND a.attnum=k.num ORDER BY k.ord) AS source_columns,
                tn.nspname AS target_schema,tt.relname AS target,
                ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord)
                  JOIN pg_attribute a ON a.attrelid=tt.oid AND a.attnum=k.num ORDER BY k.ord) AS target_columns,
                c.confupdtype AS update_action,c.confdeltype AS delete_action,c.confmatchtype,
                c.convalidated,c.condeferrable,c.condeferred
                FROM pg_constraint c JOIN pg_class st ON st.oid=c.conrelid
                JOIN pg_namespace sn ON sn.oid=st.relnamespace LEFT JOIN pg_class tt ON tt.oid=c.confrelid
                LEFT JOIN pg_namespace tn ON tn.oid=tt.relnamespace
                WHERE sn.nspname='public' AND st.relname<>'_prisma_migrations'`)).rows;
            const triggers = (await client.query(`SELECT c.relname AS table,t.tgname AS name FROM pg_trigger t
                JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relname<>'_prisma_migrations' AND NOT t.tgisinternal`)).rows;
            const differences = [];
            const compareSet = (label,actual,expected) => {
                const a = sorted(actual), e = sorted(expected);
                for (const value of e) if (!a.includes(value)) differences.push(`${label}: missing ${value}`);
                for (const value of a) if (!e.includes(value)) differences.push(`${label}: unexpected ${value}`);
                if (a.length !== e.length) differences.push(`${label}: count ${a.length}, expected ${e.length}`);
            };
            compareSet('tables',tableRows.map(row=>row.name),names);
            compareSet('column names',actualColumns.map(row=>[row.table,row.name]),columns.map(row=>[row.table,row.name]));
            for (const expected of columns) {
                const actual = actualColumns.find(row=>row.table===expected.table&&row.name===expected.name);
                if (!actual) continue;
                for (const key of ['type','required','length','precision']) {
                    if (actual[key] !== expected[key]) differences.push(`${expected.table}.${expected.name}: ${key} differs`);
                }
                if (actual.attidentity || actual.attgenerated) differences.push(`${expected.table}.${expected.name}: unexpected identity/generated behavior`);
                const def = actual.default_expression;
                const matches = {none:()=>def===null,
                    sequence:()=>/^nextval\(/.test(def||'')&&!!actual.owned_sequence,
                    now:()=>/^(now\(\)|CURRENT_TIMESTAMP)$/.test(def||''),
                    date:()=>def==='CURRENT_DATE',boolean:()=>def==='true',
                    string:()=>def===`'${expected.defaultValue}'::character varying`}[expected.defaultKind]();
                // Do not print actual default expressions: they could contain secrets.
                if (!matches) differences.push(`${expected.table}.${expected.name}: default or sequence ownership differs`);
            }
            compareSet('indexes',indexes.map(row=>[row.table,row.kind,row.columns]),keys);
            for (const row of indexes) if (!row.valid) differences.push(`${row.table}: invalid/partial/expression/nonstandard index`);
            compareSet('primary constraints',constraints.filter(row=>row.kind==='p').map(row=>[row.source,'primary',row.source_columns]),keys.filter(row=>row[1]==='primary'));
            const fks = constraints.filter(row=>row.kind==='f');
            compareSet('foreign keys',fks.map(row=>[row.source,row.source_columns,row.target,row.target_columns]),foreignKeys);
            for (const row of fks) if (row.target_schema!=='public'||row.update_action!=='a'||row.delete_action!=='a'
                ||row.confmatchtype!=='s'||!row.convalidated||row.condeferrable||row.condeferred)
                differences.push(`${row.source}.${row.source_columns.join(',')}: FK policy/validation differs from reviewed Prisma baseline`);
            for (const row of constraints) if (!['p','f','u','n'].includes(row.kind)) differences.push(`${row.source}: extra constraint ${row.name}`);
            for (const row of triggers) differences.push(`${row.table}: extra application trigger ${row.name}`);
            // Prisma history is infrastructure and only inspected if present.
            const hasHistory = (await client.query("SELECT to_regclass('public.\"_prisma_migrations\"') IS NOT NULL AS present")).rows[0].present;
            let history = [];
            if (hasHistory) history = (await client.query(`SELECT migration_name,checksum,finished_at,rolled_back_at
                FROM public."_prisma_migrations" ORDER BY started_at`)).rows;
            const acceptedHashes = [sql,sql.replace(/\r\n/g,'\n'),sql.replace(/\r?\n/g,'\r\n')]
                .map(value=>crypto.createHash('sha256').update(value).digest('hex'));
            const historyMatches = history.length===1&&history[0].migration_name==='20261019020000_supabase_v2_init'
                &&history[0].finished_at!==null&&history[0].rolled_back_at===null&&acceptedHashes.includes(history[0].checksum);
            await client.query('ROLLBACK'); began = false;
            console.log(JSON.stringify({databaseResult:differences.length?'FAIL':'PASS',
                applicationTables:tableRows.length,physicalFields:actualColumns.length,foreignKeys:fks.length,
                primaryKeys:constraints.filter(row=>row.kind==='p').length,
                uniqueIndexes:indexes.filter(row=>row.kind==='unique').length,
                nonuniqueIndexes:indexes.filter(row=>row.kind==='index').length,
                compositePrimaryKeys:constraints.filter(row=>row.kind==='p'&&row.source_columns.length>1)
                    .map(row=>({table:row.source,columns:row.source_columns})),
                noActionMatchesReviewedPrisma:fks.length===24&&fks.every(row=>row.update_action==='a'&&row.delete_action==='a'),
                policyNote:'DBML does not specify FK actions; NO ACTION and timestamptz(6) are explicit Prisma interpretations.',
                migrationHistoryMatchesInitialSql:historyMatches,
                migrationHistoryNote:historyMatches?'One successful matching initial migration':'Review history separately; it is not an application entity or DBML structural constraint',
                differences},null,2));
            process.exitCode = differences.length ? 1 : 0;
        } catch (error) {
            console.error('DATABASE VERIFICATION INCOMPLETE:',error.code||'connection/configuration/catalog error');
            console.error('No database PASS is claimed. Credentials and connection strings are not logged.');
            process.exitCode = 2;
        } finally {
            if (began) await client.query('ROLLBACK').catch(()=>{});
            await client.end().catch(()=>{});
        }
    })();
}
'@ | node
    $taskExitCode = $LASTEXITCODE
}
finally {
    [Environment]::SetEnvironmentVariable('PGUSER', $taskPreviousUser, 'Process')
    [Environment]::SetEnvironmentVariable('PGPASSWORD', $taskPreviousPassword, 'Process')
    [Environment]::SetEnvironmentVariable('IM101_SCHEMA_STATIC_ONLY', $taskPreviousMode, 'Process')
    [Environment]::SetEnvironmentVariable('IM101_SCHEMA_REVIEW_ROOT', $taskPreviousRoot, 'Process')
    $taskCredential = $null
}
exit $taskExitCode
