# Logo File Information

## ✅ Logo File Located Here

**File**: `Logo.png`  
**Full Path**: `apps/client/public/images/Logo.png`  
**Component Path**: `/images/Logo.png`

---

## 🎨 Where This Logo Appears

Your logo is automatically used in:

1. **Dashboard Sidebar** (Desktop)
   - Full logo with text
   - Located at top of sidebar
   - Clickable - navigates to dashboard

2. **Mobile Header**
   - Icon version for compact display
   - Appears when sidebar is hidden

3. **Login Page**
   - Desktop: Full logo in left panel (white theme)
   - Mobile: Full logo at top of form

4. **Register Page**
   - Desktop: Full logo in left panel (white theme)
   - Mobile: Full logo at top of form

---

## 🔧 Technical Details

**Logo Component**: `apps/client/src/components/ui/Logo.tsx`

**Current Configuration**:
```typescript
const LOGO_PATH = '/images/Logo.png';
```

**Image Tag**:
```tsx
<img 
  src="/images/Logo.png" 
  alt="BulkFlow Logo" 
  className="object-contain rounded-lg"
/>
```

---

## 🚀 How It Works

1. **Public Folder**: Files in `public/` are served directly
2. **Path Resolution**: `/images/Logo.png` resolves to `public/images/Logo.png`
3. **Automatic Loading**: Component detects and loads your logo
4. **Graceful Fallback**: If logo fails, shows icon instead

---

## 📏 Logo Specifications

Based on your logo file, the component will:
- Maintain aspect ratio
- Scale to appropriate size for each location
- Add rounded corners
- Ensure proper contrast on all backgrounds

---

## ✨ Features

✅ **Responsive** - Adapts to screen size  
✅ **Themeable** - Light/dark variants  
✅ **Optimized** - Fast loading with caching  
✅ **Fallback** - Shows icon if image fails  
✅ **Accessible** - Proper alt text included  

---

## 🧪 Test Your Logo

Start the dev server to see your logo:

```bash
npm run dev
```

Visit these URLs:
- **Dashboard**: http://localhost:5173/dashboard (sidebar)
- **Login**: http://localhost:5173/auth/login
- **Mobile**: Resize browser to < 768px width

---

## 📝 Need to Change Logo?

1. Replace this file with your new logo
2. Keep the same name: `Logo.png`
3. Restart dev server if running
4. Clear browser cache (Ctrl+Shift+R)

Or change the filename in the component:
`apps/client/src/components/ui/Logo.tsx`

```typescript
const LOGO_PATH = '/images/YourNewLogo.png';
```

---

**Status**: ✅ Logo configured and ready to use!
