const heur = require('../lib/heuristicsManager');
heur.load();
console.log('Heuristic rules:', (heur.getAll().rules || []).length);
console.log('Validation problems:', JSON.stringify(heur.validate(), null, 2));
