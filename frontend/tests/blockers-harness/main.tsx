import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter,Routes,Route } from 'react-router-dom';
import { IdentityHarness } from './identity';
import { AdminHarness } from './admin';
import { StoreProvider, useStore } from '../../src/features/storefront/context/StoreContext';
import LegalEditor from '../../src/features/admin/pages/Legal';
import { CookieConsentBanner } from '../../src/features/storefront/components/store/CookieConsentBanner';
function RefreshControl(){const {refreshLegal}=useStore();(window as any).qaRefreshLegal=refreshLegal;return null;}
createRoot(document.getElementById('root')!).render(<IdentityHarness><BrowserRouter><StoreProvider><AdminHarness><RefreshControl/><Routes><Route path="/emprendedor/legal/:type" element={<LegalEditor/>}/><Route path="*" element={<><h1>Tienda QA</h1><CookieConsentBanner/></>}/></Routes></AdminHarness></StoreProvider></BrowserRouter></IdentityHarness>);
