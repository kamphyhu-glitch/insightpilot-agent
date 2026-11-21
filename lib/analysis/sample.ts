export const sampleDataset = {
  name: 'campaign_performance.csv',
  csv: `date,channel,campaign,visits,signups,revenue,spend
2026-11-01,Search,Always-on,1200,96,4200,1200
2026-11-02,Search,Always-on,1300,104,4500,1250
2026-11-03,Search,Always-on,1450,116,4800,1300
2026-11-04,Search,Always-on,1500,120,5200,1350
2026-11-05,Search,Always-on,1480,118,5100,1320
2026-11-06,Search,Always-on,1650,132,5600,1400
2026-11-01,Social,New audience,1800,72,2300,1000
2026-11-02,Social,New audience,2000,80,2600,1100
2026-11-03,Social,New audience,1900,76,2400,1050
2026-11-04,Social,New audience,2200,88,2800,1200
2026-11-05,Social,New audience,2400,96,3100,1300
2026-11-06,Social,New audience,2300,92,2900,1250
2026-11-01,Email,November digest,600,60,1800,100
2026-11-02,Email,November digest,680,68,2100,110
2026-11-03,Email,November digest,750,75,2400,115
2026-11-04,Email,November digest,720,72,2200,110
2026-11-05,Email,November digest,850,85,2700,125
2026-11-06,Email,November digest,900,90,3000,130
2026-11-01,Referral,Partner program,400,40,1400,200
2026-11-02,Referral,Partner program,450,45,1600,210
2026-11-03,Referral,Partner program,480,48,1700,220
2026-11-04,Referral,Partner program,430,43,1500,205
2026-11-05,Referral,Partner program,550,55,1900,230
2026-11-06,Referral,Partner program,600,60,2100,250`,
}

export const sampleQuestions = [
  { title: '哪些渠道贡献最多？', question: '按 channel 汇总 revenue，比较各渠道的收入贡献。', tag: '渠道表现' },
  { title: '每日注册表现如何？', question: '按 date 汇总 signups，查看每日注册数量。', tag: '每日趋势' },
  { title: '这份数据可靠吗？', question: '检查缺失值和重复行，给出数据质量报告。', tag: '数据质量' },
]
