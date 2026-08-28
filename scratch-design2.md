# PathFinder Design System

## Core Identity
A premium, Apple-inspired dark mode aesthetic. The tone is sophisticated, precision-engineered, and minimalist. It relies on deep blacks, subtle silver/metallic gradients, and high-contrast glassmorphic elements to guide the user.

**CONTEXT:** This is a Hackathon project, NOT a commercial product. Do NOT include links or buttons for "Pricing", "Upgrade to Pro", "Billing", "Terms of Service", etc. Keep the navigation and UI strictly focused on the core features: Dashboard, Mentor Chat, Roadmap, and Calibration. The AI's name is "Nexus".

## Color Palette
- **Background**: True Black (#000000) or very deep charcoal (#0A0A0A) for structural depth.
- **Surface/Cards**: Glassmorphic dark materials (e.g. #1C1C1E at 60% opacity with backdrop-blur-xl).
- **Primary Accent**: Silver/Titanium gradient (light metallic grey #E5E5EA to #8E8E93).
- **Text (Primary)**: Pure White (#FFFFFF) or off-white (#F5F5F7).
- **Text (Secondary)**: Silver Grey (#8E8E93).
- **Borders**: Extremely subtle, 1px solid #333336 or linear-gradient from white/10% to transparent.

## Typography
- **Typeface**: San Francisco (SF Pro Display / SF Pro Text) or Inter.
- **Headings**: Tight tracking, high contrast. Heavy use of metallic gradients on large hero text (e.g. background-clip: text; color: transparent).
- **Body**: Highly legible, slightly relaxed line-height (1.5), size 15px or 17px.

## UI Elements & States
- **Buttons (Primary)**: Silver/white background with black text. Soft inner glow or drop shadow.
- **Buttons (Secondary)**: Blurred translucent background, white text. Hover state brightens the background slightly.
- **Cards**: Rounded corners (24px to 32px radii), subtle inner borders, severe background blur (backdrop-filter: blur(20px)).
- **Inputs**: Darker than the surface, pill-shaped or softly rounded, silver text, focused state introduces a subtle silver glow.
- **Animations**: Silky smooth, spring-based physics (resembling Framer Motion springs). 400ms duration, subtle scale (0.98 on tap), slow fade-ins.

## Component Specifics
- **Chat Bubbles**: Nexus's bubbles are dark glassmorphic (#1C1C1E). User bubbles are subtle silver (#3A3A3C).
- **Phase Buttons (Yes/No)**: Pill-shaped, elegantly animated on hover.
