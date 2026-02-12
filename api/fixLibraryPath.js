const mongoose = require('mongoose');
const LibraryRoot = require('../models/LibraryRoot');

async function consolidateRoots() {
    try {
        await mongoose.connect('mongodb://localhost:27017/VeilSite');
        console.log('Connected to MongoDB');

        // 1. Find all problematic roots
        const roots = await LibraryRoot.find({
            path: { $in: ['E:Comic Series', 'E:\\Comic Series'] }
        });

        if (roots.length > 1) {
            console.log(`Found ${roots.length} duplicate roots. Cleaning up...`);
            
            // Just delete all of them and recreate one clean one, or delete all but one
            const idsToDelete = roots.map(r => r._id);
            await LibraryRoot.deleteMany({ _id: { $in: idsToDelete } });
            console.log('Deleted all redundant entries.');

            const cleanRoot = new LibraryRoot({
                name: "Main Comic Series",
                path: "E:\\Comic Series",
                isActive: true
            });
            await cleanRoot.save();
            console.log('Created single clean root for E:\\Comic Series');
        } else if (roots.length === 1) {
            const r = roots[0];
            r.path = "E:\\Comic Series";
            await r.save();
            console.log('Updated single existing root path.');
        }

        // Final check
        const allRoots = await LibraryRoot.find();
        console.log('\nFinal Library Roots:');
        allRoots.forEach(r => console.log(` - ${r.name}: ${r.path}`));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

consolidateRoots();