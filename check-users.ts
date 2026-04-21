import { db } from './server/db';
import { users } from './db/schema';

async function checkUsers() {
  const allUsers = await db.select().from(users);
  console.log('Total users:', allUsers.length);
  console.log('Users:', JSON.stringify(allUsers.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt
  })), null, 2));
}

checkUsers().catch(console.error);
