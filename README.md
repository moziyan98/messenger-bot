# messenger-bot

This Messenger bot looks for messages from one page, and schedules or posts relevent information to another page. 

Unfortunately, the relevent pages are a secret :) 

The general flow is

- User enters "check" or "check unread". 
- Programs fetches newest or unread submission from a google sheets, where read/decided submissions are based on cell color. 
- Program prints a list of submission, each as its own text bubble. 
- User replies "yes", "no", "manual", "manual post" for a text bubble. 
- Program changes the color in the google sheets, and looks for the next available time & post id, and finally schedules or posts it sometimes between 11 am and 11 pm EST, in 2 hour intervals. 
