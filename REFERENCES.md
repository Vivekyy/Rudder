# References

The following papers inspired Rudder's approach to turning agent experience and
user feedback into durable runtime guidance.

## Getting Better at Working With You: Compiling User Corrections into Runtime Enforcement for Coding Agents

- URL: <https://arxiv.org/abs/2606.13174>
- Authors: Yujun Zhou, Kehan Guo, Haomin Zhuang, Xiangqi Wang, Yue Huang,
  Zhenwen Liang, Pin-Yu Chen, Tian Gao, Nuno Moniz, Nitesh V. Chawla, and
  Xiangliang Zhang.
- Inspiration: This paper's Test-time Rule Acquisition and Compiled Enforcement
  (Trace) framing motivates Rudder's pipeline for converting user corrections
  into atomic rules, applicability checks, and Stop-hook enforcement.

```bibtex
@article{zhou2026trace,
  title   = {Getting Better at Working With You: Compiling User Corrections
             into Runtime Enforcement for Coding Agents},
  author  = {Zhou, Yujun and Guo, Kehan and Zhuang, Haomin and Wang, Xiangqi
             and Huang, Yue and Liang, Zhenwen and Chen, Pin-Yu and Gao, Tian
             and Moniz, Nuno and Chawla, Nitesh V. and Zhang, Xiangliang},
  journal = {arXiv preprint arXiv:2606.13174},
  year    = {2026}
}
```

## Evolving Agents in the Dark: Retrospective Harness Optimization via Self-Preference

- URL: <https://paper-rho.wenbo.io/>
- Authors: Wenbo Pan, Shujie Liu, Chin-Yew Lin, Jingying Zeng, Xianfeng Tang,
  Xiangyang Zhou, Yan Lu, and Xiaohua Jia.
- Inspiration: Retrospective Harness Optimization (RHO) motivates Rudder's use
  of past agent trajectories as a signal for improving persistent instructions,
  skills, tools, and workflows without requiring externally labeled validation
  data.

```bibtex
@article{pan2026rho,
  title   = {Evolving Agents in the Dark: Retrospective Harness
             Optimization via Self-Preference},
  author  = {Pan, Wenbo and Liu, Shujie and Lin, Chin-Yew and Zeng, Jingying
             and Tang, Xianfeng and Zhou, Xiangyang and Lu, Yan and Jia, Xiaohua},
  journal = {arXiv preprint arXiv:2606.05922},
  year    = {2026}
}
```
