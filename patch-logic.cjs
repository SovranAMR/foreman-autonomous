const fs = require('fs');
let code = fs.readFileSync('bebek-isim-app/index.js', 'utf8');

// Fix double name generation issue
code = code.replace(
    /if \(n1\.syllables \+ n2\.syllables <= 5\) \{/g,
    'if (n1.syllables + n2.syllables <= 7) {'
);

// Add fallback if doubleNames is empty
code = code.replace(
    /finalRecommendations = doubleNames;/g,
    'finalRecommendations = doubleNames.length > 0 ? doubleNames : recommendations;'
);

// Add fallback if mixed is empty
code = code.replace(
    /finalRecommendations = mixed.sort\(\(a, b\) => parseFloat\(b.score\) - parseFloat\(a.score\)\);/g,
    'finalRecommendations = mixed.length > 0 ? mixed.sort((a, b) => parseFloat(b.score) - parseFloat(a.score)) : recommendations;'
);

// If user rates all names or unratedNames is empty
code = code.replace(
    /const unratedNames = validNames.filter\(n => !ratedIds.includes\(n.id\)\);/g,
    'const unratedNames = validNames.filter(n => !ratedIds.includes(n.id));\n  if (unratedNames.length === 0) return res.json({ profile: { categoryWeights, eraWeights }, recommendations: validNames.slice(0, 10).map(n => ({...n, score: "50.0"})), highestScore: 50, questionsAsked: ratedIds.length, nextQuestion: null });'
);

fs.writeFileSync('bebek-isim-app/index.js', code);
