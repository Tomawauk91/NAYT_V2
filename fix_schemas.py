import re

with open('backend/app/schemas.py', 'r') as f:
    content = f.read()

# Fix duplicates of mission_id in ScanRequest, MissionBase, AutoScanRequest etc.
# Actually let's just rewrite the end classes
import ast

def clean_class(class_str):
    # Just manual fix
    pass

