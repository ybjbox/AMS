export const defaultTemplate = `<h1 class="text-3xl font-bold text-center mb-12 tracking-widest">劳动合同书</h1>
<div class="space-y-6 text-base leading-relaxed">
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
    <div>
      <p><span class="font-bold">甲方（用人单位）：</span>某某科技有限公司</p>
      <p><span class="font-bold">法定代表人：</span>张三</p>
      <p><span class="font-bold">联系地址：</span>北京市朝阳区科技园1号</p>
    </div>
    <div>
      <p><span class="font-bold">乙方（劳动者）：</span><span class="border-b border-black px-4">{name}</span></p>
      <p><span class="font-bold">身份证号码：</span><span class="border-b border-black px-4">{idCard}</span></p>
      <p><span class="font-bold">联系电话：</span><span class="border-b border-black px-4">{phone}</span></p>
    </div>
  </div>

  <p class="indent-8">根据《中华人民共和国劳动法》、《中华人民共和国劳动合同法》及相关法律法规的规定，甲乙双方遵循合法、公平、平等自愿、协商一致、诚实信用的原则，订立本劳动合同，共同遵守本合同所列条款。</p>

  <h2 class="text-lg font-bold mt-6 mb-2">一、 合同期限</h2>
  <p class="indent-8">本合同为固定期限劳动合同。合同期为 <span class="border-b border-black px-4">{contractYears}</span> 年，自 <span class="border-b border-black px-2">{signYear}</span> 年 <span class="border-b border-black px-2">{signMonth}</span> 月 <span class="border-b border-black px-2">{signDay}</span> 日起至 <span class="border-b border-black px-2">{expiryYear}</span> 年 <span class="border-b border-black px-2">{expiryMonth}</span> 月 <span class="border-b border-black px-2">{expiryDay}</span> 日止。</p>
  <p class="indent-8">其中试用期为 <span class="border-b border-black px-4">3</span> 个月，自合同起始日起计算。</p>

  <h2 class="text-lg font-bold mt-6 mb-2">二、 工作内容和工作地点</h2>
  <p class="indent-8">1. 乙方同意根据甲方工作需要，在 <span class="border-b border-black px-4">{department}</span> 部门担任 <span class="border-b border-black px-4">{role}</span> 岗位工作。</p>
  <p class="indent-8">2. 乙方的工作地点为：<span class="border-b border-black px-4">公司所在地或甲方指定的其他地点</span>。</p>

  <h2 class="text-lg font-bold mt-6 mb-2">三、 工作时间和休息休假</h2>
  <p class="indent-8">1. 甲方安排乙方执行标准工时制度，每日工作时间不超过8小时，每周工作时间不超过40小时。</p>
  <p class="indent-8">2. 乙方依法享受国家规定的法定节假日、带薪年休假、婚丧假、产假等假期。</p>

  <h2 class="text-lg font-bold mt-6 mb-2">四、 劳动报酬</h2>
  <p class="indent-8">1. 甲方每月按时以货币形式支付乙方工资，乙方的试用期工资为人民币 <span class="border-b border-black px-8"></span> 元/月，转正后工资为人民币 <span class="border-b border-black px-8"></span> 元/月。</p>
  <p class="indent-8">2. 甲方于每月 <span class="border-b border-black px-4">15</span> 日前支付上月工资。</p>

  <h2 class="text-lg font-bold mt-6 mb-2">五、 社会保险和福利待遇</h2>
  <p class="indent-8">1. 甲乙双方必须依法参加社会保险，按时足额缴纳社会保险费。</p>
  <p class="indent-8">2. 乙方在孕期、产期、哺乳期等各项福利待遇，按国家和地方有关规定执行。</p>

  <div class="mt-24 grid grid-cols-1 sm:grid-cols-2 gap-8">
    <div>
      <p>甲方（公章）：</p>
      <br /><br />
      <p>法定代表人或授权代表（签字）：</p>
      <br />
      <p>日期：______年____月____日</p>
    </div>
    <div>
      <p>乙方（签字）：</p>
      <br /><br />
      <p>日期：______年____月____日</p>
    </div>
  </div>
</div>`;
