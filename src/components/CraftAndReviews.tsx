export function CraftAndReviews() {
  const steps = [
    {
      num: '01.',
      title: 'من الخلية',
      body: 'نقطف الإطارات الناضجة فقط في مواسم الإزهار الجبلية، ونترك للنحل ما يكفيه من الغذاء الطبيعي.',
    },
    {
      num: '02.',
      title: 'على البارد',
      body: 'نستخلص العسل دون تسخين أو تصفية دقيقة حتى يحتفظ بإنزيماته الطبيعية وحبوب اللقاح وطعمه الأصيل.',
    },
    {
      num: '03.',
      title: 'إلى بابك',
      body: 'نعبّئ العسل بكميات صغيرة في برطمانات زجاجية ونوصّل في نفس اليوم داخل الدار البيضاء.',
    },
  ];

  const ratingBars = [
    { stars: '5 نجوم', pct: 78 },
    { stars: '4 نجوم', pct: 15 },
    { stars: '3 نجوم', pct: 4 },
    { stars: '2 نجوم', pct: 2 },
    { stars: '1 نجمة', pct: 1 },
  ];

  const reviews = [
    {
      quote:
        'وصل برطمان عسل الزهور في نفس العصر، وكأنه خرج من الشمس لتوه. طعمه يشبه العسل الذي كانت جدتي تجلبه من الأطلس.',
      author: 'سلمى ك.',
      location: 'الدار البيضاء · عميلة موثّقة',
      time: 'قبل أسبوعين',
    },
    {
      quote:
        'طلبت عسل السدر لوالدي. البرطمان كان مغلقًا جيدًا والتغليف يبدو كهدية حقيقية. سنطلب مرة أخرى.',
      author: 'محمد ل.',
      location: 'الرباط · عميل موثّق',
      time: 'قبل شهر',
    },
    {
      quote:
        'جودة ممتازة بسعر عادل. قطعة الشمع اختفت في ليلة واحدة مع الخبز والجبن، والخدمة عبر الواتساب سريعة وواضحة.',
      author: 'حسن س.',
      location: 'الدار البيضاء · عميل موثّق',
      time: 'قبل شهرين',
    },
  ];

  return (
    <>
      <section id="craft" className="border-y border-[#2f2817] bg-[#0e0c08] py-16">
        <div className="mx-auto max-w-[1200px] px-5">
          <div className="mb-10">
            <h2 className="gold-text font-display text-3xl font-bold sm:text-4xl">
              كيف نحصد العسل
            </h2>
            <p className="mt-1.5 text-sm text-[#a99d83]">
              ثلاث خطوات واضحة، بلا تسخين وبلا تصفية صناعية.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step) => (
              <div
                key={step.num}
                className="rounded-2xl border border-[#2f2817] bg-[#13110c] p-6"
              >
                <div className="font-display text-2xl font-bold tabular-nums text-[#d4a537]">
                  {step.num}
                </div>
                <h3 className="font-display mt-2 text-xl font-bold text-[#f4ecd8]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#a99d83]">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="reviews" className="py-16">
        <div className="mx-auto max-w-[1200px] px-5">
          <div className="mb-10">
            <h2 className="gold-text font-display text-3xl font-bold sm:text-4xl">
              ماذا يقول عملاؤنا
            </h2>
            <p className="mt-1.5 text-sm text-[#a99d83]">
              مشترون موثّقون من الدار البيضاء والرباط ومراكش.
            </p>
          </div>

          <div className="grid gap-10 lg:grid-cols-[280px_1fr]">
            <div className="rounded-2xl border border-[#2f2817] bg-[#13110c] p-6">
              <div className="gold-text font-display text-6xl font-bold leading-none tabular-nums">
                4.8
              </div>
              <p className="mt-2 text-sm text-[#a99d83] tabular-nums">
                من 5 · استنادًا إلى 1,240 تقييم
              </p>

              <div className="mt-6 space-y-2.5 text-xs text-[#a99d83]">
                {ratingBars.map((bar) => (
                  <div key={bar.stars} className="flex items-center gap-3">
                    <span className="w-12 shrink-0">{bar.stars}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#2a2312]">
                      <div
                        className="h-full rounded-full bg-[#d4a537]"
                        style={{ width: `${bar.pct}%` }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-left tabular-nums">{bar.pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              {reviews.map((review) => (
                <blockquote
                  key={review.author}
                  className="rounded-2xl border border-[#2f2817] bg-[#13110c] p-6"
                >
                  <p className="text-base leading-relaxed text-[#f4ecd8]">«{review.quote}»</p>
                  <footer className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#a99d83]">
                    <span className="font-semibold text-[#e9c565]">{review.author}</span>
                    <span aria-hidden="true">·</span>
                    <span>{review.location}</span>
                    <span aria-hidden="true">·</span>
                    <span>{review.time}</span>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
