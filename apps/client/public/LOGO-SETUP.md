# Logo Setup Instructions

## How to Add Your Logo

### Step 1: Prepare Your Logo File

Your logo should be a PNG file with a transparent background for best results.

**Recommended specifications:**
- Format: PNG with transparent background
- Dimensions: 
  - Square logo: 200x200px to 512x512px
  - Rectangular logo: Height of 200-300px (width proportional)
- File size: Under 100KB (optimized for web)

### Step 2: Place Your Logo

Copy your logo file to this directory and name it `logo.png`:

```
apps/client/public/logo.png
```

**Alternative naming:**
If you want to use a different name, update the path in:
- `apps/client/src/components/ui/Logo.tsx`
- Change the `LOGO_PATH` constant

### Step 3: Verify

After placing your logo:

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Check these locations:
   - **Sidebar**: Left side of dashboard (full logo with text)
   - **Header**: Top bar on mobile view (icon only)
   - **Login/Register pages**: If Logo component is used

### Logo Variants

The Logo component supports different variants:

#### 1. Full Logo (with text)
```tsx
<Logo variant="full" size="md" showVersion={true} />
```
Shows your logo image + "BulkFlow" text + version badge

#### 2. Icon Only
```tsx
<Logo variant="icon" size="sm" />
```
Shows fallback icon (no text)

#### 3. Image Only
```tsx
<Logo variant="image" size="md" />
```
Shows only your logo image (no text or fallback)

### Customization

#### Change Logo Sizes

Edit `apps/client/src/components/ui/Logo.tsx`:

```tsx
const sizeClasses = {
  sm: { image: 'h-7' },
  md: { image: 'h-9' },   // ← Change these heights
  lg: { image: 'h-12' },
};
```

#### Hide Subtitle

```tsx
<Logo showSubtitle={false} />
```

#### Add Click Handler

```tsx
<Logo onClick={() => navigate('/dashboard')} />
```

### Troubleshooting

#### Logo doesn't appear

1. **Check file path**: Ensure logo is at `apps/client/public/logo.png`
2. **Check file name**: Must be exactly `logo.png` (lowercase)
3. **Check browser console**: Look for 404 errors
4. **Clear cache**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

#### Logo looks distorted

1. **Check aspect ratio**: Use a square or properly proportioned logo
2. **Adjust size**: Modify the `image` height in size classes
3. **Use object-fit**: The component uses `object-contain` by default

#### Fallback icon shows instead of logo

- This means the image failed to load
- Check browser console for errors
- Verify the file path and name
- Ensure the file is a valid PNG

### Production Build

When building for production, your logo will be automatically included:

```bash
npm run build
```

The logo will be copied from `apps/client/public/` to `apps/server/public/` during the build process.

### Examples

#### Current Setup (Sidebar)
```tsx
<Logo 
  variant="full" 
  size="md" 
  showVersion={true}
  onClick={() => navigate('/dashboard')}
/>
```

#### Current Setup (Header - Mobile)
```tsx
<Logo variant="icon" size="sm" />
```

### Need Help?

- Logo component location: `apps/client/src/components/ui/Logo.tsx`
- Sidebar usage: `apps/client/src/components/layout/Sidebar.tsx`
- Header usage: `apps/client/src/components/layout/Header.tsx`
