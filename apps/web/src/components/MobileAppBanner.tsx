'use client';

import Image from 'next/image';
import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import appIconPng from '../app/app-icon.png';

const DISMISSED_KEY = 'mobile-app-banner-dismissed';

export default function MobileAppBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="bg-muted/30 border-b">
      <div className="container flex items-center gap-3 py-2.5 sm:gap-4">
        <Image
          src={appIconPng}
          alt="ensemble app icon"
          width={36}
          height={36}
          className="h-9 w-9 flex-shrink-0 rounded-[22%] shadow-sm"
        />
        <p className="min-w-0 flex-1 text-sm text-gray-700">
          <span className="font-semibold">ensemble is on iOS!</span>{' '}
          <span className="text-muted-foreground hidden sm:inline">
            Practice on the go in those spare 5 or 10 minute pockets of time.
          </span>
        </p>
        <a
          href="https://apps.apple.com/us/app/ensemble-language/id6770618195"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 transition-transform duration-200 hover:scale-105"
          aria-label="Download ensemble on the App Store"
        >
          <img
            src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83"
            alt="Download on the App Store"
            className="h-9 w-auto"
          />
        </a>
        <button
          onClick={dismiss}
          aria-label="Dismiss banner"
          className="text-muted-foreground hover:text-foreground flex-shrink-0 rounded p-1 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
