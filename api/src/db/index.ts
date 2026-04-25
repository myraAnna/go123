import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const db = postgres(connectionString, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
});
