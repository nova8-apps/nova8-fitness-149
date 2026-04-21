// ─── PreviewModeBanner ──────────────────────────────────────────────────────
// Sleek, dismissable, top-of-screen pill shown only in the Nova8 preview
// sandbox. Native builds (TestFlight / App Store) never render this.
//
// Design notes (Wave 17.2):
//   - Floats at the very top of the screen (absolute), above all content,
//     instead of taking space inside auth cards.
//   - Single compact horizontal pill; shortened copy "Preview · Accounts
//     reset each session" with a "Why?" disclosure that reveals the full
//     explanation on tap.
//   - Closeable via × button. Dismissal persists via sessionStorage so it
//     doesn't pop back after every HMR/render cycle, but it DOES reset on a
//     fresh browser session so users are still warned once per sandbox spin.
//   - Uses react-native's native Text (not the gluestack wrapper) to avoid
//     web-side class-based styles that break word-wrap.

import React, { useEffect, useState } from 'react';
import { View, Text, Platform, Pressable } from 'react-native';
import { Info, X, ChevronDown, ChevronUp } from 'lucide-react-native';
import { colors } from '@/lib/theme';

const SS_KEY = 'nova8:preview-banner-dismissed';

function isPreview(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  const host = window.location?.hostname || '';
  return host.endsWith('.e2b.app') || host === 'localhost' || host === '127.0.0.1';
}

export function PreviewModeBanner() {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(true); // hidden until we read storage to avoid SSR flash
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const was =
        typeof window !== 'undefined' &&
        window.sessionStorage?.getItem(SS_KEY) === '1';
      setDismissed(!!was);
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!mounted || !isPreview() || dismissed) return null;

  const dismiss = () => {
    try {
      window.sessionStorage?.setItem(SS_KEY, '1');
    } catch {}
    setDismissed(true);
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: Platform.OS === 'web' ? 8 : 44,
        left: 12,
        right: 12,
        zIndex: 9999,
        alignItems: 'center',
      }}
      testID="preview-mode-banner"
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surfaceElevated,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 5,
          paddingLeft: 10,
          paddingRight: 4,
          maxWidth: 360,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 6,
        }}
      >
        <Info size={12} color={colors.primary} style={{ marginRight: 6 }} />
        <Text
          style={{ fontSize: 11, color: colors.textSecondary, flexShrink: 1 }}
          numberOfLines={1}
        >
          <Text style={{ fontWeight: '600', color: colors.textPrimary }}>
            Preview
          </Text>
          <Text> · Accounts reset each session</Text>
        </Text>
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          hitSlop={8}
          style={{
            marginLeft: 6,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 999,
            flexDirection: 'row',
            alignItems: 'center',
          }}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Hide details' : 'Why?'}
        >
          <Text
            style={{
              fontSize: 10.5,
              color: colors.primary,
              fontWeight: '600',
              marginRight: 2,
            }}
          >
            Why?
          </Text>
          {expanded ? (
            <ChevronUp size={11} color={colors.primary} />
          ) : (
            <ChevronDown size={11} color={colors.primary} />
          )}
        </Pressable>
        <Pressable
          onPress={dismiss}
          hitSlop={10}
          style={{
            marginLeft: 2,
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss preview notice"
          testID="preview-mode-banner-close"
        >
          <X size={12} color={colors.textSecondary} />
        </Pressable>
      </View>
      {expanded && (
        <View
          style={{
            marginTop: 6,
            maxWidth: 360,
            backgroundColor: colors.surfaceElevated,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            paddingVertical: 8,
            paddingHorizontal: 12,
          }}
        >
          <Text
            style={{ fontSize: 11, lineHeight: 15, color: colors.textSecondary }}
          >
            This notice only shows in preview. Your TestFlight and App Store
            builds keep data forever.
          </Text>
        </View>
      )}
    </View>
  );
}

export default PreviewModeBanner;
