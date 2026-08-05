import json
import os
import re

conversations = [
    "353a3b9b-f367-429e-96a7-aef01534fc6a",
    "6dd8342c-e000-48f9-bf40-cf9882b31100",
    "0a94a61f-6f2e-4a11-a4ce-bef74ba2b505",
    "d1558170-6105-4dd3-be35-69ffca016f96",
    "f0664b02-d9a0-49b8-bd6a-a9f13af2296d",
    "4ac25983-b5e8-4891-8496-9287af483f0e",
    "5f0b90c5-afe4-4092-a6d2-b632bec8808d"
]

base_dir = "/Users/aliumair/.gemini/antigravity-ide/brain"
for conv_id in conversations:
    log_path = os.path.join(base_dir, conv_id, ".system_generated/logs/transcript.jsonl")
    if not os.path.exists(log_path): continue
    
    print(f"\n=== {conv_id} ===")
    with open(log_path, 'r') as f:
        user_msg = None
        for line in f:
            try:
                data = json.loads(line)
            except:
                continue
            if data.get("type") == "USER_INPUT":
                user_msg = data.get("content", "").strip()
                # strip out metadata xml tags if present
                user_msg = re.sub(r'<USER_REQUEST>.*?</USER_REQUEST>', lambda m: m.group(0), user_msg, flags=re.DOTALL)
                if "<USER_REQUEST>" in user_msg:
                    user_msg = user_msg.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0].strip()
                if len(user_msg) > 5:
                    print(f"\n[USER]: {user_msg}")
            elif data.get("type") == "PLANNER_RESPONSE" and user_msg is not None:
                content = data.get("content", "").strip()
                if content:
                    summary = content.split('.')[0].replace(chr(10), ' ')
                    print(f"[AGENT]: {summary}.")
                user_msg = None
