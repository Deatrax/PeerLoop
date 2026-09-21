import { test, expect, type Page } from '@playwright/test';
async function login(page:Page,account:string){
  await page.goto('/');
  await page.getByRole('button',{name:'Offline demo',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(account)}).click();
}
test('student resolves a sourced answer, persists it and changes appearance',async({page})=>{
  await login(page,'Arisha');
  await page.getByRole('button',{name:'Ask',exact:true}).click();
  await page.getByRole('textbox',{name:'What do you need help with?'}).fill('Does anyone have the CSE 4790 Week 6 slides?');
  await page.getByRole('button',{name:'Check for an answer',exact:true}).click();
  await expect(page.getByText(/Nobody was notified/).first()).toBeVisible();
  await page.getByRole('button',{name:'That’s what I needed'}).click();
  // Accepting lands on the thread, which is a pushed detail screen with no tab bar.
  await page.getByRole('button',{name:/Back/}).click();
  await page.getByRole('button',{name:'Profile',exact:true}).click();
  await page.getByRole('button',{name:'dark',exact:true}).click();
  await page.reload();
  await expect(page.getByText('Your contribution stays private.',{exact:false})).toBeVisible();
  await page.screenshot({path:'/tmp/peerloop-e2e/student-dark.png',fullPage:true});
});
test('CR can author a verified answer without creating a request',async({page})=>{
  await login(page,'Rifat');
  await page.getByRole('button',{name:'Knowledge',exact:true}).click();
  await page.getByRole('button',{name:'Add knowledge',exact:true}).click();
  await page.getByLabel(/Question/).fill('Where is the pilot orientation checklist?');
  await page.getByLabel('The answer',{exact:true}).fill('The orientation checklist is on the course noticeboard.');
  await page.getByRole('button',{name:/Publish/}).click();
  await expect(page.getByText('Where is the pilot orientation checklist?').first()).toBeVisible();
});
for(const [account,heading] of [['Nasrin','Only what needs your call.'],['Department admin','']] as const){
  test(`${account} role renders its operational screens`,async({page})=>{
    await login(page,account);
    if(heading){await page.getByRole('button',{name:'Needs you',exact:true}).click();await expect(page.getByText(heading)).toBeVisible();}
    else {
      await expect(page.getByRole('button',{name:'Admin',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Analytics',exact:true}).click();
      await page.getByRole('button',{name:'Admin',exact:true}).click();
      await expect(page.getByText('Defaults for new hubs')).toBeVisible();
      await expect(page.getByText(/T1 6h → T2 24h → T4 24h → T5 approval/)).toBeVisible();
    }
    await expect(page.getByText(/Something went wrong|Uncaught Error/)).toHaveCount(0);
  });
}
