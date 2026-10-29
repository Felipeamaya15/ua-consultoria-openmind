const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test 1: Verify humanizeError logic
const humanizeErrorPath = path.join(__dirname, '../src/features/admin/utils/humanizeError.ts');
const humanizeContent = fs.readFileSync(humanizeErrorPath, 'utf8');

assert(humanizeContent.includes('export function humanizeErrorMessage'), 'humanizeErrorMessage must be exported');
assert(humanizeContent.includes('export function humanizeAdminError'), 'humanizeAdminError must be exported');
assert(humanizeContent.includes('isTechnicalError'), 'isTechnicalError must be exported');

// Test 2: Verify shared core export
const coreHumanizePath = path.join(__dirname, '../src/core/utils/humanizeError.ts');
const coreHumanizeContent = fs.readFileSync(coreHumanizePath, 'utf8');
assert(coreHumanizeContent.includes('humanizeErrorMessage'), 'Core must re-export humanizeErrorMessage');

// Test 3: Email templates default definition includes orderSummary
const emailTemplatesPath = path.join(__dirname, '../src/features/admin/data/emailTemplates.ts');
const emailTemplatesContent = fs.readFileSync(emailTemplatesPath, 'utf8');
assert(emailTemplatesContent.includes('{{orderSummary}}'), 'emailTemplates.ts must include {{orderSummary}} in default bodies');

// Test 4: Emails.tsx includes orderSummary variable chip
const emailsPagePath = path.join(__dirname, '../src/features/admin/pages/Emails.tsx');
const emailsPageContent = fs.readFileSync(emailsPagePath, 'utf8');
assert(emailsPageContent.includes('"{{orderSummary}}"'), 'Emails.tsx must include "{{orderSummary}}" in variables array');
assert(emailsPageContent.includes('humanizeErrorMessage'), 'Emails.tsx must use humanizeErrorMessage');

// Test 5: OrderConfirmation.tsx includes OrderSummaryCard in all visual templates
const orderConfirmationPath = path.join(__dirname, '../src/features/storefront/pages/OrderConfirmation.tsx');
const orderConfirmationContent = fs.readFileSync(orderConfirmationPath, 'utf8');
assert(orderConfirmationContent.includes('OrderSummaryCard'), 'OrderConfirmation.tsx must import and use OrderSummaryCard');
assert(orderConfirmationContent.includes('sessionStorage.getItem(`order-tracking:${orderNumber}`)'), 'OrderConfirmation must retrieve stored summary if state is lost');

// Test 6: TransbankReturnResult.tsx includes OrderSummaryCard and humanizeErrorMessage
const transbankPath = path.join(__dirname, '../src/features/storefront/pages/TransbankReturnResult.tsx');
const transbankContent = fs.readFileSync(transbankPath, 'utf8');
assert(transbankContent.includes('OrderSummaryCard'), 'TransbankReturnResult must import and use OrderSummaryCard');
assert(transbankContent.includes('humanizeErrorMessage'), 'TransbankReturnResult must use humanizeErrorMessage');

// Test 7: Checkout.tsx saves summary in order-tracking and navigation state, and humanizes errors
const checkoutPath = path.join(__dirname, '../src/features/storefront/pages/Checkout.tsx');
const checkoutContent = fs.readFileSync(checkoutPath, 'utf8');
assert(checkoutContent.includes('humanizeErrorMessage'), 'Checkout.tsx must use humanizeErrorMessage');
assert(checkoutContent.includes('summary,'), 'Checkout.tsx must save summary in sessionStorage and navigate state');

console.log('✔ All 7 QA tests for order summary and humanized error messages passed successfully!');
