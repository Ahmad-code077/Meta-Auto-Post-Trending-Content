Tomorrow's Tasks:

1. Fix Table Width Issue
   Remove all max-width and fixed width classes from Post column

Keep only min-width for Post column (e.g., min-w-[250px])

Ensure table wrapper has overflow-x-auto for horizontal scroll

Test on mobile, tablet, and desktop

2. Simplify Actions Column Logic
   For Pending posts: Show only "Generate Image" button

For Approved posts WITH image_url: Show platform selection + "Publish" button

For Approved posts WITHOUT image_url: Show nothing or "No image generated"

Remove unnecessary dropdown menu items

3. Platform Selection Design
   Use simple toggle buttons for Instagram/Facebook (no labels)

Show visual feedback when selected (filled vs outline button)

"Publish" button disabled until at least 1 platform selected
