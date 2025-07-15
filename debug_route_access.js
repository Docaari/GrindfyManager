import { isSuperAdmin, hasRouteAccess, hasPageAccess, hasTagAccess, getUserTags, SUBSCRIPTION_PROFILES } from './shared/permissions.ts';

// Test USER-0003 (laisag97@hotmail.com) com plano premium
const userEmail = 'laisag97@hotmail.com';
const subscriptionPlan = 'premium';

console.log('=== DEBUGGING ROUTE ACCESS FOR USER-0003 ===');
console.log('User:', userEmail);
console.log('Subscription Plan:', subscriptionPlan);
console.log('Is Super Admin:', isSuperAdmin(userEmail));
console.log('');

// Test Premium subscription profile
console.log('=== SUBSCRIPTION PROFILE TEST ===');
const profile = SUBSCRIPTION_PROFILES[subscriptionPlan];
console.log('Premium profile:', profile);
console.log('Premium tags:', profile ? profile.tags : 'NOT FOUND');
console.log('Premium pages:', profile ? profile.pages : 'NOT FOUND');
console.log('');

// Test getUserTags
console.log('=== GET USER TAGS TEST ===');
const userTags = getUserTags(subscriptionPlan);
console.log('User tags for premium:', userTags);
console.log('');

// Test routes that should work for premium
const testRoutes = [
  '/dashboard',
  '/upload-history', 
  '/grade-planner',
  '/grind-live',
  '/warm-up'
];

console.log('=== ROUTE ACCESS TESTS ===');
testRoutes.forEach(route => {
  console.log(`\nTesting route: ${route}`);
  const hasAccess = hasRouteAccess(subscriptionPlan, route, userEmail);
  console.log(`Result: ${hasAccess ? '✅ PERMITIDO' : '❌ NEGADO'}`);
});

console.log('\n=== DIRECT PAGE ACCESS TESTS ===');
const testPages = [
  'dashboard',
  'upload-history',
  'grade-planner', 
  'grind-session',
  'warm-up'
];

testPages.forEach(page => {
  console.log(`\nTesting page: ${page}`);
  const hasAccess = hasPageAccess(subscriptionPlan, page, userEmail);
  console.log(`Result: ${hasAccess ? '✅ PERMITIDO' : '❌ NEGADO'}`);
});

console.log('\n=== DIRECT TAG ACCESS TESTS ===');
const testTags = [
  'dashboard',
  'import',
  'grade',
  'grind',
  'warm_up'
];

testTags.forEach(tag => {
  console.log(`\nTesting tag: ${tag}`);
  const hasAccess = hasTagAccess(subscriptionPlan, tag, userEmail);
  console.log(`Result: ${hasAccess ? '✅ PERMITIDO' : '❌ NEGADO'}`);
});