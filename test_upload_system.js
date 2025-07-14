// Sistema de teste para uploads
const sites = [
  { name: 'PokerStars', testData: 'Tournament ID,Name,Buy-in,Prize,Position,Date,Site,Format,Category,Speed,Field Size\n12345,Test Tournament,10,50,1,2025-01-01,PokerStars,MTT,Vanilla,Normal,100' },
  { name: '888poker', testData: 'Tournament ID,Name,Buy-in,Prize,Position,Date,Site,Format,Category,Speed,Field Size\n12346,888 Tournament,20,100,2,2025-01-02,888poker,MTT,PKO,Turbo,200' },
  { name: 'PartyPoker', testData: 'Tournament ID,Name,Buy-in,Prize,Position,Date,Site,Format,Category,Speed,Field Size\n12347,Party Tournament,30,150,3,2025-01-03,PartyPoker,MTT,Mystery,Hyper,300' }
];

console.log('🧪 Sistema de teste configurado para', sites.length, 'sites');
