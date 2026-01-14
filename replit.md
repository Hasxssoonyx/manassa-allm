# منصة الأستاذ الذكية (Smart Teacher Platform)

## Overview
This is an Arabic-language educational platform built with React and Vite. It provides a teacher-student management system with login options for both teachers and students.

## Project Architecture
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS (via CDN)
- **Language**: Arabic (RTL layout)

## Project Structure
- `App.tsx` - Main application component
- `index.tsx` - Application entry point
- `index.html` - HTML template with Tailwind configuration
- `components/` - React components (HomeworkItem, LessonCard, Modal)
- `types.ts` - TypeScript type definitions
- `constants.tsx` - Application constants
- `firebase.ts` - Firebase configuration (if used)
- `vite.config.ts` - Vite configuration

## Development
- Run `npm run dev` to start development server on port 5000
- Run `npm run build` to build for production
- Run `npm run preview` to preview production build

## Deployment
Configured for static deployment with Vite build output in `dist/` directory.

## Recent Changes
- January 2026: Initial import and Replit environment setup
  - Configured Vite to use port 5000
  - Added `allowedHosts: true` for Replit proxy compatibility
  - Set up static deployment configuration
