import { seedDatabase } from '@peerloop/core';
import { transact } from '../lib/store';
if(process.env.NODE_ENV==='production'&&process.env.ALLOW_DEMO_SEED!=='true')throw new Error('Demo seed is disabled in production. Use a dedicated preview database.');
transact(db=>({users:db.users.length,spaces:db.spaces.length}),{reset:seedDatabase(Date.now())}).then(result=>{console.log('PeerLoop seed reset:',result);process.exit(0);}).catch(error=>{console.error(error);process.exit(1);});
