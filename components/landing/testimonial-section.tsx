import { Star } from "lucide-react";

const testimonials = [
  {
    name: "김철수",
    role: "게임 운영 팀장",
    company: "ABC Games",
    content: "GM-Tool을 도입한 후 운영 효율이 200% 이상 향상되었습니다. 실시간 모니터링과 빠른 대응이 가능해져 유저 만족도도 크게 상승했습니다.",
    rating: 5,
  },
  {
    name: "이영희",
    role: "CS 매니저",
    company: "XYZ Entertainment",
    content: "직관적인 인터페이스와 강력한 기능으로 CS 업무가 훨씬 수월해졌습니다. 특히 실시간 데이터 분석 기능이 매우 유용합니다.",
    rating: 5,
  },
  {
    name: "박지민",
    role: "게임 프로듀서",
    company: "GameStudio",
    content: "안정적인 서비스와 뛰어난 기술 지원이 인상적입니다. 대규모 게임 운영에도 문제없이 사용할 수 있어 매우 만족스럽습니다.",
    rating: 5,
  }
];

export function TestimonialSection() {
  return (
    <section className="py-20 px-4 md:px-6 lg:px-8">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">
            신뢰할 수 있는 파트너사들의 후기
          </h2>
          <p className="text-xl text-muted-foreground">
            실제 사용 중인 고객들의 생생한 후기를 확인하세요
          </p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="p-6 rounded-lg border bg-card text-card-foreground"
            >
              <div className="flex mb-4">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-5 w-5 text-yellow-400 fill-current"
                  />
                ))}
              </div>
              <blockquote className="mb-4 text-lg">
                "{testimonial.content}"
              </blockquote>
              <div>
                <div className="font-semibold">{testimonial.name}</div>
                <div className="text-sm text-muted-foreground">
                  {testimonial.role}, {testimonial.company}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
} 