from pathlib import Path
root = Path(__file__).resolve().parent
s = (root/'deploy-chat-scroll-latest-20261016.py').read_text()
s = s.replace('chat-scroll-latest', 'campaign-personalization').replace('20261016.zip', '20261017.zip').replace('DEPLOYED_CHAT_SCROLL_LATEST', 'DEPLOYED_CAMPAIGN_PERSONALIZATION')
start = s.index('    for command in [')
end = s.index(':\n        try: subprocess.run', start)
s = s[:start] + "    for command in [['python3','deployment/verify-backup-retention.py'],['python3','deployment/verify-stage-cleanup.py'],['node','deployment/verify-campaign-personalization.cjs'],['npm','run','build']]" + s[end:]
s = s.replace("['node','deployment/verify-conversations-live.cjs']", "['node','deployment/verify-campaign-personalization-live.cjs']")
s = s.replace("CHAT_TEST_BASE='http://127.0.0.1:3001'", "CAMPAIGN_TEST_BASE='http://127.0.0.1:3001'")
# Schema-rejected POST must reach schema validation in the isolated Next server.
s = s.replace("env=dict(env, CAMPAIGN_TEST_BASE=", "env=dict(env, DISPATCH_QUEUE_ENABLED='true', CAMPAIGN_TEST_BASE=")
s = s.replace("cwd=stage, env=env, stdout=http_log", "cwd=stage, env=dict(env, DISPATCH_QUEUE_ENABLED='true'), stdout=http_log")
s = s.replace('ISOLATED_AUTHENTICATED_CHAT_API_CHECKS_PASSED', 'ISOLATED_AUTHENTICATED_CAMPAIGN_CHECKS_PASSED')
s = s.replace("    assert after['doran-whatsapp']['pm2_env']['WHATSAPP_ENABLED'] == 'true'", "    assert after['doran-whatsapp']['pm2_env']['WHATSAPP_ENABLED'] == 'true'\n    subprocess.run(['node','deployment/verify-campaign-personalization-live.cjs'], cwd=app, env=os.environ.copy(), check=True)")
(root/'deploy-campaign-personalization-20261017.py').write_text(s, encoding='utf-8')
print('DEPLOYER_READY')
